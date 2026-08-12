import {
  BlobServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";

import { IAccountModel } from "../../../src/common/AccountModel";
import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getTestServerBaseURL,
  getUniqueName
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

const VERSIONING_ENABLED_ACCOUNT_MODEL: IAccountModel = {
  accounts: [
    {
      name: EMULATOR_ACCOUNT_NAME,
      blobService: { isVersioningEnabled: true }
    }
  ]
};

describe("BlobVersioningAPIs", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer(
    false,
    false,
    false,
    undefined,
    VERSIONING_ENABLED_ACCOUNT_MODEL
  );

  const baseURL = getTestServerBaseURL(server);
  const serviceClient = new BlobServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 },
        keepAliveOptions: { enable: false }
      }
    )
  );

  let containerName: string = getUniqueName("container");
  let containerClient = serviceClient.getContainerClient(containerName);
  let blobName: string = getUniqueName("blob");
  let blockBlobClient = containerClient.getBlockBlobClient(blobName);

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  beforeEach(async () => {
    containerName = getUniqueName("container");
    containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();
    blobName = getUniqueName("blob");
    blockBlobClient = containerClient.getBlockBlobClient(blobName);
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  /**
   * List every version of a blob, oldest first.
   */
  async function listVersions(name: string) {
    const items = [];
    for await (const item of containerClient.listBlobsFlat({
      includeVersions: true
    })) {
      if (item.name === name) {
        items.push(item);
      }
    }
    return items;
  }

  it("Upload should return a version ID @loki", async () => {
    const upload = await blockBlobClient.upload("version1", 8);

    assert.notStrictEqual(
      upload.versionId,
      undefined,
      "Expected x-ms-version-id on the upload response"
    );
    // RFC 3339 with 7 digit fractional seconds, as Azure returns
    assert.ok(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.test(upload.versionId!),
      `Unexpected version ID format: ${upload.versionId}`
    );

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 1);
    assert.strictEqual(versions[0].versionId, upload.versionId);
    assert.strictEqual(versions[0].isCurrentVersion, true);
  });

  it("Overwrite should preserve the previous content as a version @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);

    assert.notStrictEqual(first.versionId, second.versionId);

    // The current version has the new content
    const current = await blockBlobClient.download();
    assert.strictEqual(await bodyToString(current, 8), "version2");

    // The previous version still has the old content
    const previous = await blockBlobClient
      .withVersion(first.versionId!)
      .download();
    assert.strictEqual(await bodyToString(previous, 8), "version1");

    // Both versions are listed, oldest first, and exactly one is current
    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 2);
    assert.strictEqual(versions[0].versionId, first.versionId);
    assert.strictEqual(versions[1].versionId, second.versionId);
    assert.notStrictEqual(versions[0].isCurrentVersion, true);
    assert.strictEqual(versions[1].isCurrentVersion, true);
  });

  it("List blobs should hide previous versions unless requested @loki", async () => {
    await blockBlobClient.upload("version1", 8);
    await blockBlobClient.upload("version2", 8);

    const withoutVersions = [];
    for await (const item of containerClient.listBlobsFlat()) {
      withoutVersions.push(item);
    }

    assert.strictEqual(
      withoutVersions.length,
      1,
      "Only the current version should be listed by default"
    );
    assert.strictEqual(withoutVersions[0].name, blobName);

    const withVersions = await listVersions(blobName);
    assert.strictEqual(withVersions.length, 2);
  });

  it("Get properties should report the current version @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);

    // Without a version ID the request addresses the current version
    const current = await blockBlobClient.getProperties();
    assert.strictEqual(current.versionId, second.versionId);
    assert.strictEqual(current.isCurrentVersion, true);

    // Explicitly addressing the current version behaves the same
    const currentByVersion = await blockBlobClient
      .withVersion(second.versionId!)
      .getProperties();
    assert.strictEqual(currentByVersion.versionId, second.versionId);
    assert.strictEqual(currentByVersion.isCurrentVersion, true);

    // x-ms-is-current-version is absent for a previous version
    const previous = await blockBlobClient
      .withVersion(first.versionId!)
      .getProperties();
    assert.strictEqual(previous.versionId, first.versionId);
    assert.notStrictEqual(previous.isCurrentVersion, true);
  });

  it("Download of an unknown version should fail with 404 @loki", async () => {
    await blockBlobClient.upload("version1", 8);

    let error;
    try {
      await blockBlobClient
        .withVersion("2020-01-01T00:00:00.0000000Z")
        .download();
    } catch (err) {
      error = err;
    }

    assert.notStrictEqual(error, undefined);
    assert.strictEqual((error as any).statusCode, 404);
  });

  it("Deleting a single version should leave the others intact @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);

    await blockBlobClient.withVersion(first.versionId!).delete();

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 1);
    assert.strictEqual(versions[0].versionId, second.versionId);

    // The current version is still readable
    const current = await blockBlobClient.download();
    assert.strictEqual(await bodyToString(current, 8), "version2");
  });

  it("Deleting the current version should retain previous versions @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    await blockBlobClient.upload("version2", 8);

    // Deleting the blob does not fail even though previous versions exist, and it does
    // not remove them. This differs from snapshots, which return SnapshotsPresent.
    await blockBlobClient.delete();

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 1);
    assert.strictEqual(versions[0].versionId, first.versionId);
    assert.notStrictEqual(versions[0].isCurrentVersion, true);

    // The blob itself is gone
    assert.strictEqual(await blockBlobClient.exists(), false);

    // But the previous version is still readable by version ID
    const previous = await blockBlobClient
      .withVersion(first.versionId!)
      .download();
    assert.strictEqual(await bodyToString(previous, 8), "version1");
  });

  it("Restore should be a copy of a previous version over the current one @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    await blockBlobClient.upload("version2", 8);

    const sourceUrl = blockBlobClient.withVersion(first.versionId!).url;
    const poller = await blockBlobClient.beginCopyFromURL(sourceUrl);
    await poller.pollUntilDone();

    const restored = await blockBlobClient.download();
    assert.strictEqual(await bodyToString(restored, 8), "version1");
  });

  it("Snapshot and version ID together should fail with 400 @loki", async () => {
    const upload = await blockBlobClient.upload("version1", 8);
    const snapshot = await blockBlobClient.createSnapshot();

    // withSnapshot()/withVersion() both rewrite the URL, so chaining them produces a
    // request carrying the snapshot and versionid query parameters at the same time.
    const both = blockBlobClient
      .withSnapshot(snapshot.snapshot!)
      .withVersion(upload.versionId!);

    let error;
    try {
      await both.download();
    } catch (err) {
      error = err;
    }

    assert.notStrictEqual(
      error,
      undefined,
      "Expected the snapshot and versionid combination to be rejected"
    );
    assert.strictEqual((error as any).statusCode, 400);
    assert.strictEqual(
      (error as any).code,
      "InvalidQueryParameterValue",
      "Error code should match the real service"
    );
  });

  it("Commit block list should create a version @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);

    const blockId = Buffer.from("block-1").toString("base64");
    await blockBlobClient.stageBlock(blockId, "version2", 8);
    const commit = await blockBlobClient.commitBlockList([blockId]);

    assert.notStrictEqual(commit.versionId, undefined);
    assert.notStrictEqual(commit.versionId, first.versionId);

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 2);
    assert.strictEqual(versions[0].versionId, first.versionId);
    assert.strictEqual(versions[1].versionId, commit.versionId);
    assert.strictEqual(versions[1].isCurrentVersion, true);

    const previous = await blockBlobClient
      .withVersion(first.versionId!)
      .download();
    assert.strictEqual(await bodyToString(previous, 8), "version1");
  });

  it("Snapshots should still block deleting the base blob @loki", async () => {
    await blockBlobClient.upload("version1", 8);
    await blockBlobClient.createSnapshot();

    let error;
    try {
      await blockBlobClient.delete();
    } catch (err) {
      error = err;
    }

    assert.notStrictEqual(
      error,
      undefined,
      "Expected SnapshotsPresent when snapshots exist"
    );
    assert.strictEqual((error as any).statusCode, 409);
  });
});

describe("BlobVersioningDisabledAPIs", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();

  const baseURL = getTestServerBaseURL(server);
  const serviceClient = new BlobServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 },
        keepAliveOptions: { enable: false }
      }
    )
  );

  let containerName: string = getUniqueName("container");
  let containerClient = serviceClient.getContainerClient(containerName);
  let blobName: string = getUniqueName("blob");
  let blockBlobClient = containerClient.getBlockBlobClient(blobName);

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  beforeEach(async () => {
    containerName = getUniqueName("container");
    containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();
    blobName = getUniqueName("blob");
    blockBlobClient = containerClient.getBlockBlobClient(blobName);
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  it("Upload should not return a version ID when versioning is disabled @loki", async () => {
    const upload = await blockBlobClient.upload("version1", 8);
    assert.strictEqual(upload.versionId, undefined);
  });

  it("Overwrite should replace the blob when versioning is disabled @loki", async () => {
    await blockBlobClient.upload("version1", 8);
    await blockBlobClient.upload("version2", 8);

    const items = [];
    for await (const item of containerClient.listBlobsFlat({
      includeVersions: true
    })) {
      items.push(item);
    }

    assert.strictEqual(items.length, 1, "No versions should be retained");
    assert.strictEqual(items[0].versionId, undefined);

    const current = await blockBlobClient.download();
    assert.strictEqual(await bodyToString(current, 8), "version2");
  });

  it("Get properties should not report version information @loki", async () => {
    await blockBlobClient.upload("version1", 8);
    const properties = await blockBlobClient.getProperties();
    assert.strictEqual(properties.versionId, undefined);
    assert.strictEqual(properties.isCurrentVersion, undefined);
  });
});
