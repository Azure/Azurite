import {
  BlobServiceClient,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME } from "../testutils";
import { assertBlobFixtureSurvived, uploadBlobFixture } from "./utils/blobUploader";
import { buildBlobFixtures } from "./utils/dataFixtures";
import { installNpmVersion } from "./utils/npmVersionInstaller";
import { NpmProcessTarget } from "./utils/upgradeTarget";
import { getLatestPublishedNpmVersion } from "./utils/versionResolver";

// This suite requires network access (npm registry) and a local production
// build (`npm run build`). Run via `npm run test:upgrade`.

const BLOB_PORT = 12000;
const QUEUE_PORT = 12001;
const TABLE_PORT = 12002;

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

function makeServiceClient(): BlobServiceClient {
  const credential = new StorageSharedKeyCredential(
    EMULATOR_ACCOUNT_NAME,
    EMULATOR_ACCOUNT_KEY
  );
  return new BlobServiceClient(
    `http://127.0.0.1:${BLOB_PORT}/${EMULATOR_ACCOUNT_NAME}`,
    credential
  );
}

describe("Blob upgrade compatibility @upgrade", function () {
  this.timeout(10 * 60 * 1000);

  const dataLocation = mkdtempSync(join(tmpdir(), "azurite-upgrade-blob-"));
  const containerName = "upgrade-test-container";
  const fixtures = buildBlobFixtures();

  let oldVersionEntryPoint: string;
  let oldInstallDir: string | undefined;

  before(async function () {
    throwOnMissingLocalBuild();
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

  it("seeds data with the latest published version, then reads it back byte-for-byte with the local build", async function () {
    // 1. Start the OLD (latest published) version and seed data.
    const oldTarget = new NpmProcessTarget(oldVersionEntryPoint, dataLocation, ports);
    await oldTarget.start();

    try {
      const serviceClient = makeServiceClient();
      const containerClient = serviceClient.getContainerClient(containerName);
      await containerClient.create();

      for (const fixture of fixtures) {
        await uploadBlobFixture(containerClient, fixture);
      }
    } finally {
      await oldTarget.stop();
    }

    // 2. Start the LOCAL (new / unreleased) build against the SAME data location.
    const newTarget = new NpmProcessTarget(LOCAL_ENTRY_POINT, dataLocation, ports);
    await newTarget.start();

    try {
      const serviceClient = makeServiceClient();
      const containerClient = serviceClient.getContainerClient(containerName);

      for (const fixture of fixtures) {
        await assertBlobFixtureSurvived(containerClient, fixture);
      }
    } finally {
      await newTarget.stop();
    }
  });
});
