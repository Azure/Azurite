import * as assert from "assert";
import { AzureNamedKeyCredential, TableClient } from "@azure/data-tables";
import {
  BlobServiceClient,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import { QueueClient } from "@azure/storage-queue";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME } from "../testutils";
import { assertBlobFixtureSurvived, uploadBlobFixture } from "./utils/blobUploader";
import {
  buildBlobFixtures,
  buildQueueFixtures,
  buildTableEntityFixtures
} from "./utils/dataFixtures";
import {
  buildLocalImage,
  pullImage,
  removeImage,
  resetVolumeOwnership
} from "./utils/dockerHarness";
import {
  assertEntityMatchesFixture,
  toCreateEntityPayload
} from "./utils/tableValueCodec";
import { DockerContainerTarget } from "./utils/upgradeTarget";
import { getLatestPublishedDockerTag } from "./utils/versionResolver";

// This suite requires Docker and network access (MCR). Run via
// `npm run test:upgrade:docker`.

const BLOB_PORT = 12400;
const QUEUE_PORT = 12401;
const TABLE_PORT = 12402;
const PORTS = { blobPort: BLOB_PORT, queuePort: QUEUE_PORT, tablePort: TABLE_PORT };

const REPO_ROOT = join(__dirname, "..", "..");
const LOCAL_IMAGE_TAG = "azurite-upgrade-local:test";
const OLD_CONTAINER_NAME = "azurite-upgrade-old";
const NEW_CONTAINER_NAME = "azurite-upgrade-new";

function throwOnMissingDocker() {
  try {
    execFileSync("docker", ["version", "--format", "{{.Server.Version}}"], {
      stdio: "ignore"
    });
  } catch {
    throw new Error(
      "Docker is not available in this environment. Docker must be installed and running to execute the docker upgrade test."
    );
  }
}

function makeBlobServiceClient(port: number): BlobServiceClient {
  const credential = new StorageSharedKeyCredential(
    EMULATOR_ACCOUNT_NAME,
    EMULATOR_ACCOUNT_KEY
  );
  return new BlobServiceClient(
    `http://127.0.0.1:${port}/${EMULATOR_ACCOUNT_NAME}`,
    credential
  );
}

function makeQueueClient(port: number, queueName: string): QueueClient {
  const credential = new StorageSharedKeyCredential(
    EMULATOR_ACCOUNT_NAME,
    EMULATOR_ACCOUNT_KEY
  );
  return new QueueClient(
    `http://127.0.0.1:${port}/${EMULATOR_ACCOUNT_NAME}/${queueName}`,
    credential
  );
}

function makeTableClient(port: number, tableName: string): TableClient {
  const credential = new AzureNamedKeyCredential(
    EMULATOR_ACCOUNT_NAME,
    EMULATOR_ACCOUNT_KEY
  );
  return new TableClient(
    `http://127.0.0.1:${port}/${EMULATOR_ACCOUNT_NAME}`,
    tableName,
    credential,
    { allowInsecureConnection: true }
  );
}

describe("Docker image upgrade compatibility @upgrade @docker", function () {
  this.timeout(15 * 60 * 1000);

  const containerName = "upgrade-test-container";
  // Same fixture builders as the npm-based suites, so Docker exercises the
  // exact same blob types / table property types - no reduced coverage.
  const blobFixtures = buildBlobFixtures();
  const queueFixture = buildQueueFixtures("dockerupgrade");
  const { tableName, entities } = buildTableEntityFixtures(
    "dockerupgradetable",
    "1"
  );

  let volumeHostDir: string;
  let oldImageTag: string;

  before(async function () {
    throwOnMissingDocker();
    volumeHostDir = mkdtempSync(join(tmpdir(), "azurite-upgrade-docker-"));
    const tag = await getLatestPublishedDockerTag();
    oldImageTag = `mcr.microsoft.com/azure-storage/azurite:${tag}`;
    pullImage(oldImageTag);
    buildLocalImage(LOCAL_IMAGE_TAG, REPO_ROOT);
  });

  after(function () {
    if (volumeHostDir) {
      resetVolumeOwnership(volumeHostDir, LOCAL_IMAGE_TAG);
      removeImage(LOCAL_IMAGE_TAG);
      rmSync(volumeHostDir, { recursive: true, force: true });
    }
  });

  it("seeds blob/queue/table data with the latest published MCR image, then reads it back with a locally-built image mounting the same volume", async function () {
    // 1. Run the OLD (latest published) MCR image and seed data.
    const oldTarget = new DockerContainerTarget({
      image: oldImageTag,
      containerName: OLD_CONTAINER_NAME,
      volumeHostDir,
      ...PORTS
    });
    await oldTarget.start();

    try {
      const blobServiceClient = makeBlobServiceClient(BLOB_PORT);
      const containerClient =
        blobServiceClient.getContainerClient(containerName);
      await containerClient.create();
      for (const fixture of blobFixtures) {
        await uploadBlobFixture(containerClient, fixture);
      }

      const queueClient = makeQueueClient(QUEUE_PORT, queueFixture.queueName);
      await queueClient.create();
      for (const message of queueFixture.messages) {
        await queueClient.sendMessage(message);
      }

      const tableClient = makeTableClient(TABLE_PORT, tableName);
      await tableClient.createTable();
      for (const entity of entities) {
        await tableClient.createEntity(toCreateEntityPayload(entity));
      }
    } finally {
      await oldTarget.stop();
    }

    // 2. Run the LOCAL (new / unreleased) image against the SAME bind-mounted volume.
    const newTarget = new DockerContainerTarget({
      image: LOCAL_IMAGE_TAG,
      containerName: NEW_CONTAINER_NAME,
      volumeHostDir,
      ...PORTS
    });
    await newTarget.start();

    try {
      const blobServiceClient = makeBlobServiceClient(BLOB_PORT);
      const containerClient =
        blobServiceClient.getContainerClient(containerName);
      for (const fixture of blobFixtures) {
        await assertBlobFixtureSurvived(containerClient, fixture);
      }

      const queueClient = makeQueueClient(QUEUE_PORT, queueFixture.queueName);
      const properties = await queueClient.getProperties();
      assert.strictEqual(
        properties.approximateMessagesCount,
        queueFixture.messages.length,
        "Queue message count did not survive the docker image upgrade"
      );
      const received = await queueClient.receiveMessages({
        numberOfMessages: queueFixture.messages.length
      });
      const receivedTexts = received.receivedMessageItems
        .map((m) => m.messageText)
        .sort();
      const expectedTexts = [...queueFixture.messages].sort();
      assert.deepStrictEqual(
        receivedTexts,
        expectedTexts,
        "Dequeued message content did not match what was enqueued before the docker image upgrade"
      );

      const tableClient = makeTableClient(TABLE_PORT, tableName);
      for (const entity of entities) {
        const fetched = await tableClient.getEntity(
          entity.partitionKey,
          entity.rowKey
        );
        assertEntityMatchesFixture(fetched, entity);
      }
    } finally {
      await newTarget.stop();
    }
  });
});

