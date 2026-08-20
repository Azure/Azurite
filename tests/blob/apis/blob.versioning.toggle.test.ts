import {
  BlobServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";

import { IAccountModel } from "../../../src/common/account/AccountModel";
import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getTestServerBaseURL,
  getUniqueName,
  LIVE_TEST_MODE
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

const model = (isVersioningEnabled: boolean): IAccountModel => ({
  accounts: [{ name: EMULATOR_ACCOUNT_NAME, blobService: { isVersioningEnabled } }]
});

/**
 * Turning versioning on and off is a supported operation on a real storage account, and
 * these cases cover what happens to existing versions across the change. They restart the
 * server against the same workspace with different account configuration, which is how
 * the emulator expresses an account level setting change, so they cannot run in live mode.
 */
(LIVE_TEST_MODE ? describe.skip : describe)("BlobVersioningToggle", () => {
  const factory = new BlobTestServerFactory();
  const workspace = "toggle";

  function clientFor(server: { config: { host: string; port: number } }) {
    return new BlobServiceClient(
      getTestServerBaseURL(server),
      newPipeline(
        new StorageSharedKeyCredential(
          EMULATOR_ACCOUNT_NAME,
          EMULATOR_ACCOUNT_KEY
        ),
        { retryOptions: { maxTries: 1 }, keepAliveOptions: { enable: false } }
      )
    );
  }

  it("Existing versions survive versioning being turned off @loki", async () => {
    const containerName = getUniqueName("container");
    const blobName = getUniqueName("blob");

    // --- Phase 1: versioning enabled ---
    let server = factory.createServer(
      false,
      false,
      false,
      undefined,
      model(true),
      workspace
    );
    await server.start();

    let containerClient = clientFor(server).getContainerClient(containerName);
    await containerClient.create();
    let blobClient = containerClient.getBlockBlobClient(blobName);
    const first = await blobClient.upload("version1", 8);
    const second = await blobClient.upload("version2", 8);

    const countVersions = async (client: typeof containerClient) => {
      let n = 0;
      for await (const item of client.listBlobsFlat({ includeVersions: true })) {
        if (item.name === blobName) n++;
      }
      return n;
    };

    assert.strictEqual(await countVersions(containerClient), 2);
    await server.close();

    // --- Phase 2: same workspace, versioning disabled ---
    server = factory.createServer(
      false,
      false,
      false,
      undefined,
      model(false),
      workspace
    );
    await server.start();

    containerClient = clientFor(server).getContainerClient(containerName);
    blobClient = containerClient.getBlockBlobClient(blobName);

    // Existing versions are still listed and still readable by version ID
    assert.strictEqual(
      await countVersions(containerClient),
      2,
      "Existing versions must survive versioning being disabled"
    );
    const previous = await blobClient.withVersion(first.versionId!).download();
    assert.strictEqual(previous.contentLength, 8);

    // A write produces a blob that is not a version, but the previously current version
    // is still retained rather than destroyed.
    const third = await blobClient.upload("version3", 8);
    assert.strictEqual(
      third.versionId,
      undefined,
      "A write with versioning off must not return x-ms-version-id"
    );
    assert.strictEqual(
      await countVersions(containerClient),
      3,
      "The previously current version must be retained alongside the new blob"
    );
    assert.strictEqual(
      (await blobClient.withVersion(second.versionId!).download()).contentLength,
      8,
      "The version that was current when versioning was disabled must still be readable"
    );

    // Old versions can still be deleted by version ID while versioning is off
    await blobClient.withVersion(first.versionId!).delete();
    assert.strictEqual(await countVersions(containerClient), 2);

    await containerClient.delete();
    await server.close();
    await server.clean();
  });

  it("Versioning can be turned back on afterwards @loki", async () => {
    const containerName = getUniqueName("container");
    const blobName = getUniqueName("blob");

    let server = factory.createServer(
      false,
      false,
      false,
      undefined,
      model(false),
      workspace + "2"
    );
    await server.start();
    let containerClient = clientFor(server).getContainerClient(containerName);
    await containerClient.create();
    let blobClient = containerClient.getBlockBlobClient(blobName);
    const unversioned = await blobClient.upload("version1", 8);
    assert.strictEqual(unversioned.versionId, undefined);
    await server.close();

    // Enabling versioning on a workspace that already holds data is allowed. The blob
    // written beforehand has no version ID until it is modified, at which point its prior
    // state is captured as a version.
    server = factory.createServer(
      false,
      false,
      false,
      undefined,
      model(true),
      workspace + "2"
    );
    await server.start();
    containerClient = clientFor(server).getContainerClient(containerName);
    blobClient = containerClient.getBlockBlobClient(blobName);

    const versioned = await blobClient.upload("version2", 8);
    assert.notStrictEqual(versioned.versionId, undefined);

    let n = 0;
    for await (const item of containerClient.listBlobsFlat({
      includeVersions: true
    })) {
      if (item.name === blobName) n++;
    }
    assert.strictEqual(n, 2, "The pre-existing state should be captured as a version");

    await containerClient.delete();
    await server.close();
    await server.clean();
  });
});
