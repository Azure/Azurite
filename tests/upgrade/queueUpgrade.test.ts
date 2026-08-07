import * as assert from "assert";
import {
  QueueClient,
  StorageSharedKeyCredential
} from "@azure/storage-queue";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME } from "../testutils";
import { buildQueueFixtures } from "./utils/dataFixtures";
import { installNpmVersion } from "./utils/npmVersionInstaller";
import { NpmProcessTarget } from "./utils/upgradeTarget";
import { getLatestPublishedNpmVersion } from "./utils/versionResolver";

// This suite requires network access (npm registry) and a local production
// build (`npm run build`). Run via `npm run test:upgrade`.

const BLOB_PORT = 12100;
const QUEUE_PORT = 12101;
const TABLE_PORT = 12102;

const LOCAL_ENTRY_POINT = join(
  __dirname,
  "..",
  "..",
  "dist",
  "src",
  "azurite.js"
);

function throwOnMissingLocalBuild() {
  if (!existsSync(LOCAL_ENTRY_POINT)) {
    throw new Error(
      `Local build not found at ${LOCAL_ENTRY_POINT}. Run 'npm run build' first.`
    );
  }
}

function makeQueueClient(queueName: string): QueueClient {
  const credential = new StorageSharedKeyCredential(
    EMULATOR_ACCOUNT_NAME,
    EMULATOR_ACCOUNT_KEY
  );
  return new QueueClient(
    `http://127.0.0.1:${QUEUE_PORT}/${EMULATOR_ACCOUNT_NAME}/${queueName}`,
    credential
  );
}

describe("Queue upgrade compatibility @upgrade", function () {
  this.timeout(10 * 60 * 1000);

  const fixture = buildQueueFixtures("upgradetest");

  let dataLocation: string;
  let oldVersionEntryPoint: string;
  let oldInstallDir: string | undefined;

  before(async function () {
    throwOnMissingLocalBuild();
    dataLocation = mkdtempSync(join(tmpdir(), "azurite-upgrade-queue-"));
    const version = await getLatestPublishedNpmVersion();
    const installed = installNpmVersion(version);
    oldVersionEntryPoint = installed.entryPoint;
    oldInstallDir = installed.installDir;
  });

  after(function () {
    rmSync(dataLocation, { recursive: true, force: true });
    if (oldInstallDir) {
      rmSync(oldInstallDir, { recursive: true, force: true });
    }
  });

  const ports = { blobPort: BLOB_PORT, queuePort: QUEUE_PORT, tablePort: TABLE_PORT };

  it("survives an upgrade: messages enqueued with the latest published version are dequeued intact after upgrading to the local build", async function () {
    // 1. Start the OLD (latest published) version and enqueue messages.
    const oldTarget = new NpmProcessTarget(oldVersionEntryPoint, dataLocation, ports);
    await oldTarget.start();

    try {
      const queueClient = makeQueueClient(fixture.queueName);
      await queueClient.create();
      for (const message of fixture.messages) {
        await queueClient.sendMessage(message);
      }
    } finally {
      await oldTarget.stop();
    }

    // 2. Start the LOCAL (new / unreleased) build against the SAME data location.
    const newTarget = new NpmProcessTarget(LOCAL_ENTRY_POINT, dataLocation, ports);
    await newTarget.start();

    try {
      const queueClient = makeQueueClient(fixture.queueName);

      const properties = await queueClient.getProperties();
      assert.strictEqual(
        properties.approximateMessagesCount,
        fixture.messages.length,
        "Queue message count did not survive the upgrade"
      );

      const received = await queueClient.receiveMessages({
        numberOfMessages: fixture.messages.length
      });
      const receivedTexts = received.receivedMessageItems
        .map((m) => m.messageText)
        .sort();
      const expectedTexts = [...fixture.messages].sort();

      assert.deepStrictEqual(
        receivedTexts,
        expectedTexts,
        "Dequeued message content did not match what was enqueued before the upgrade"
      );
    } finally {
      await newTarget.stop();
    }
  });
});
