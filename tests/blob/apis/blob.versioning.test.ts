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
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getTestServerBaseURL,
  getUniqueName,
  LIVE_TEST_MODE
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

// In live mode this is ignored: BlobTestServerFactory returns a stub server and the real
// account gets versioning from the ARM management plane instead. The live account must
// therefore have versioning enabled for this suite to pass.
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

  it("Deleting a blob should turn the current version into a previous version @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);

    // Deleting the blob does not fail even though previous versions exist, and it does
    // not remove them. This differs from snapshots, which return SnapshotsPresent.
    await blockBlobClient.delete();

    // "the current version of the blob becomes a previous version, and there's no longer
    // a current version. Any previous versions of the blob persist." So both versions
    // survive the delete, and neither is current.
    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 2, "Both versions should survive the delete");
    assert.strictEqual(versions[0].versionId, first.versionId);
    assert.strictEqual(versions[1].versionId, second.versionId);
    for (const version of versions) {
      assert.notStrictEqual(
        version.isCurrentVersion,
        true,
        "No version should be current after the delete"
      );
      // HasVersionsOnly is NOT reported under include=versions. Verified against the
      // real service, which returns it only under include=deletedwithversions.
      assert.notStrictEqual(version.hasVersionsOnly, true);
    }

    // The blob itself is gone for callers that do not ask for a version
    assert.strictEqual(await blockBlobClient.exists(), false);

    let error;
    try {
      await blockBlobClient.download();
    } catch (err) {
      error = err;
    }
    assert.strictEqual((error as any)?.statusCode, 404);

    // Both versions remain readable by version ID, including the one that was current
    const previous = await blockBlobClient
      .withVersion(first.versionId!)
      .download();
    assert.strictEqual(await bodyToString(previous, 8), "version1");

    const wasCurrent = await blockBlobClient
      .withVersion(second.versionId!)
      .download();
    assert.strictEqual(
      await bodyToString(wasCurrent, 8),
      "version2",
      "The content that was current at delete time must not be lost"
    );
  });

  it("Writing after a delete should create a new current version @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);
    await blockBlobClient.delete();

    // "Writing new data to the blob creates a new current version of the blob. Any
    // existing versions are unaffected."
    const third = await blockBlobClient.upload("version3", 8);

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 3);
    assert.deepStrictEqual(
      versions.map((v) => v.versionId),
      [first.versionId, second.versionId, third.versionId]
    );
    assert.strictEqual(versions[2].isCurrentVersion, true);

    const current = await blockBlobClient.download();
    assert.strictEqual(await bodyToString(current, 8), "version3");
  });

  it("Deleting a blob with deleteSnapshots should retain versions @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);
    // Snapshotting a versioned blob also creates a version, so this leaves three
    const snapshot = await blockBlobClient.createSnapshot();

    await blockBlobClient.delete({ deleteSnapshots: "include" });

    // Snapshots are removed, versions are not
    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 3);
    assert.deepStrictEqual(
      versions.map((v) => v.versionId),
      [first.versionId, second.versionId, snapshot.versionId]
    );

    let snapshotCount = 0;
    for await (const item of containerClient.listBlobsFlat({
      includeSnapshots: true
    })) {
      if (item.name === blobName && item.snapshot) {
        snapshotCount++;
      }
    }
    assert.strictEqual(snapshotCount, 0, "Snapshots should have been removed");
  });

  it("Deleting the current version by ID should be rejected @loki", async () => {
    // Verified against the real service: a version ID delete may only target a previous
    // version. The current version is removed by deleting the blob without a version ID.
    const only = await blockBlobClient.upload("version1", 8);

    let error;
    try {
      await blockBlobClient.withVersion(only.versionId!).delete();
    } catch (err) {
      error = err;
    }

    assert.strictEqual((error as any)?.statusCode, 403);
    assert.strictEqual((error as any)?.code, "OperationNotAllowedOnRootBlob");

    // The blob and its version are untouched
    assert.strictEqual((await listVersions(blobName)).length, 1);
    assert.strictEqual(await blockBlobClient.exists(), true);
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
      "MutuallyExclusiveQueryParameters",
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

  /**
   * Page through a versioned listing, following continuation tokens.
   */
  async function pageThroughVersions(pageSize: number) {
    const seen: string[] = [];
    let continuationToken: string | undefined;
    let pages = 0;

    do {
      const result = await containerClient
        .listBlobsFlat({ includeVersions: true })
        .byPage({ maxPageSize: pageSize, continuationToken })
        .next();

      if (result.done) {
        break;
      }

      for (const item of result.value.segment.blobItems) {
        seen.push(`${item.name}@${item.versionId}`);
      }
      continuationToken = result.value.continuationToken;
      pages++;
      // Guard against a token that never advances
      assert.ok(pages < 50, "Listing did not terminate");
    } while (continuationToken);

    return { seen, pages };
  }

  it("Paginating versions of a single blob should return every version @loki", async () => {
    const expected: string[] = [];
    for (let i = 0; i < 5; i++) {
      const upload = await blockBlobClient.upload(`v${i}`, 2);
      expected.push(`${blobName}@${upload.versionId}`);
    }

    // A page size smaller than the number of versions forces the continuation token to
    // resume part way through one blob's versions.
    const { seen, pages } = await pageThroughVersions(2);

    assert.ok(pages > 1, `Expected more than one page, got ${pages}`);
    assert.deepStrictEqual(seen, expected);
  });

  it("Paginating versions across several blobs should return every version @loki", async () => {
    const expected: string[] = [];
    // Names are chosen so that lexical order is deterministic
    for (const suffix of ["a", "b", "c"]) {
      const name = `${blobName}-${suffix}`;
      const client = containerClient.getBlockBlobClient(name);
      for (let i = 0; i < 3; i++) {
        const upload = await client.upload(`v${i}`, 2);
        expected.push(`${name}@${upload.versionId}`);
      }
    }

    const { seen, pages } = await pageThroughVersions(2);

    assert.ok(pages > 1, `Expected more than one page, got ${pages}`);
    assert.deepStrictEqual(seen, expected);
  });

  it("Paginating without versions should be unaffected @loki", async () => {
    const names: string[] = [];
    for (const suffix of ["a", "b", "c"]) {
      const name = `${blobName}-${suffix}`;
      const client = containerClient.getBlockBlobClient(name);
      await client.upload("v0", 2);
      await client.upload("v1", 2);
      names.push(name);
    }

    const seen: string[] = [];
    let continuationToken: string | undefined;
    do {
      const result = await containerClient
        .listBlobsFlat()
        .byPage({ maxPageSize: 2, continuationToken })
        .next();
      if (result.done) break;
      for (const item of result.value.segment.blobItems) {
        seen.push(item.name);
      }
      continuationToken = result.value.continuationToken;
    } while (continuationToken);

    // Only current versions, each blob exactly once
    assert.deepStrictEqual(seen, names);
  });

  it("Set Blob Metadata should create a version @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const set = await blockBlobClient.setMetadata({ k: "v2" });

    // Set Blob Metadata is named explicitly in the docs as version creating, for every
    // blob type.
    assert.notStrictEqual(set.versionId, undefined);
    assert.notStrictEqual(set.versionId, first.versionId);

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 2);
    assert.deepStrictEqual(
      versions.map((v) => v.versionId),
      [first.versionId, set.versionId]
    );
    assert.strictEqual(versions[1].isCurrentVersion, true);

    // The previous version keeps the old metadata and the old content
    const previous = await blockBlobClient
      .withVersion(first.versionId!)
      .getProperties();
    assert.deepStrictEqual(previous.metadata ?? {}, {});
    const body = await blockBlobClient.withVersion(first.versionId!).download();
    assert.strictEqual(await bodyToString(body, 8), "version1");

    // The current version has the new metadata
    const current = await blockBlobClient.getProperties();
    assert.deepStrictEqual(current.metadata, { k: "v2" });
  });

  it("Set Blob Properties should NOT create a version @loki", async () => {
    // Verified against the real service: Set Blob Properties creates no version for any
    // blob type and returns no x-ms-version-id, despite the prose docs saying every write
    // on a block blob except Put Block creates one. The swagger agrees with the observed
    // behaviour: it does not declare x-ms-version-id on this operation.
    const first = await blockBlobClient.upload("version1", 8);
    await blockBlobClient.setHTTPHeaders({ blobContentType: "text/plain" });

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 1);
    assert.strictEqual(versions[0].versionId, first.versionId);
    assert.strictEqual(versions[0].isCurrentVersion, true);

    assert.strictEqual(
      (await blockBlobClient.getProperties()).contentType,
      "text/plain"
    );

    const name = getUniqueName("page");
    const pageClient = containerClient.getPageBlobClient(name);
    await pageClient.create(512);
    await pageClient.setHTTPHeaders({ blobContentType: "text/plain" });
    assert.strictEqual((await listVersions(name)).length, 1);
  });

  it("Page and append blob create should return a version ID @loki", async () => {
    const pageName = getUniqueName("page");
    const pageClient = containerClient.getPageBlobClient(pageName);
    const pageCreate = await pageClient.create(512);
    assert.notStrictEqual(pageCreate.versionId, undefined);

    // Put Page does not create a version
    await pageClient.uploadPages("x".repeat(512), 0, 512);
    assert.strictEqual((await listVersions(pageName)).length, 1);

    const appendName = getUniqueName("append");
    const appendClient = containerClient.getAppendBlobClient(appendName);
    const appendCreate = await appendClient.create();
    assert.notStrictEqual(appendCreate.versionId, undefined);

    // Append Block does not create a version
    await appendClient.appendBlock("y", 1);
    assert.strictEqual((await listVersions(appendName)).length, 1);

    // Set Blob Metadata does, for both types
    const pageMeta = await pageClient.setMetadata({ k: "v" });
    assert.notStrictEqual(pageMeta.versionId, undefined);
    assert.strictEqual((await listVersions(pageName)).length, 2);

    const appendMeta = await appendClient.setMetadata({ k: "v" });
    assert.notStrictEqual(appendMeta.versionId, undefined);
    assert.strictEqual((await listVersions(appendName)).length, 2);
  });

  it("Snapshot of a versioned blob should create a version @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const snapshot = await blockBlobClient.createSnapshot();

    // "a new version is created at the same time that the snapshot is created. A new
    // current version is also created when a snapshot is taken."
    assert.notStrictEqual(snapshot.snapshot, undefined);
    assert.notStrictEqual(snapshot.versionId, undefined);
    assert.notStrictEqual(snapshot.versionId, first.versionId);

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 2);
    assert.strictEqual(versions[1].versionId, snapshot.versionId);
    assert.strictEqual(versions[1].isCurrentVersion, true);
  });

  it("Copy should return the destination version ID @loki", async () => {
    const source = containerClient.getBlockBlobClient(getUniqueName("src"));
    await source.upload("source12", 8);

    const firstDest = await blockBlobClient.upload("version1", 8);
    const poller = await blockBlobClient.beginCopyFromURL(source.url);
    const copy = await poller.pollUntilDone();

    assert.notStrictEqual(copy.versionId, undefined);
    assert.notStrictEqual(copy.versionId, firstDest.versionId);

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 2);
    assert.strictEqual(versions[1].versionId, copy.versionId);
  });

  it("Tags should be per version @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    await blockBlobClient.setTags({ tier: "old" });
    const second = await blockBlobClient.upload("version2", 8);
    await blockBlobClient.setTags({ tier: "new" });

    const currentTags = await blockBlobClient.getTags();
    assert.deepStrictEqual(currentTags.tags, { tier: "new" });

    // The tags set while the first version was current belong to that version
    const firstTags = await blockBlobClient
      .withVersion(first.versionId!)
      .getTags();
    assert.deepStrictEqual(firstTags.tags, { tier: "old" });

    // Tags can be set on a specific version
    await blockBlobClient.withVersion(first.versionId!).setTags({ tier: "archived" });
    assert.deepStrictEqual(
      (await blockBlobClient.withVersion(first.versionId!).getTags()).tags,
      { tier: "archived" }
    );
    // ...without disturbing the current version
    assert.deepStrictEqual((await blockBlobClient.getTags()).tags, {
      tier: "new"
    });
    assert.strictEqual(second.versionId, (await blockBlobClient.getProperties()).versionId);
  });

  it("Access tier should be settable per version @loki", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    await blockBlobClient.upload("version2", 8);

    await blockBlobClient.withVersion(first.versionId!).setAccessTier("Cool");

    assert.strictEqual(
      (await blockBlobClient.withVersion(first.versionId!).getProperties())
        .accessTier,
      "Cool"
    );
    // The current version keeps its own tier
    assert.notStrictEqual(
      (await blockBlobClient.getProperties()).accessTier,
      "Cool"
    );
  });

  it("A malformed version ID should fail with 400 @loki", async () => {
    await blockBlobClient.upload("version1", 8);

    for (const bad of ["notatimestamp", "2026-08-13", "2026-08-13T10:00:00Z"]) {
      let error;
      try {
        await blockBlobClient.withVersion(bad).download();
      } catch (err) {
        error = err;
      }
      assert.strictEqual(
        (error as any)?.statusCode,
        400,
        `Expected 400 for version ID "${bad}"`
      );
      assert.strictEqual((error as any)?.code, "InvalidQueryParameterValue");
    }
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

// Asserts versioning is off, so it cannot run against a live account that has versioning
// enabled at the account level.
(LIVE_TEST_MODE ? describe.skip : describe)("BlobVersioningDisabledAPIs", () => {
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
