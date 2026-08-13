import {
  BlobServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";

import { AccountModel } from "../../../src/common/account/AccountModel";
import { configLogger } from "../../../src/common/Logger";
import LokiAccountModelStore from "../../../src/common/account/LokiAccountModelStore";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getTestServerBaseURL,
  getUniqueName
} from "../../testutils";

configLogger(false);

const RUN_VERSIONING_CONTRACT_TESTS =
  process.env.AZURITE_RUN_VERSIONING_CONTRACT_TESTS === "1";
const contractDescribe = RUN_VERSIONING_CONTRACT_TESTS
  ? describe
  : describe.skip;

const accountModel: AccountModel = {
  key: EMULATOR_ACCOUNT_NAME,
  isBlobVersioningEnabled: true
};
const accountModels = new Map<string, AccountModel>([
  [EMULATOR_ACCOUNT_NAME, accountModel]
]);

contractDescribe("Blob Versioning Contract", () => {
  const factory = new BlobTestServerFactory();
  const accountModelStore = new LokiAccountModelStore("", true, accountModels);
  const server = factory.createServer(
    false,
    false,
    false,
    undefined,
    accountModelStore
  );
  const serviceClient = new BlobServiceClient(
    getTestServerBaseURL(server),
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

  let containerName = getUniqueName("container");
  let containerClient = serviceClient.getContainerClient(containerName);
  let blobName = getUniqueName("blob");
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
      assert.ok(pages < 50, "Listing did not terminate");
    } while (continuationToken);

    return { seen, pages };
  }

  it("returns a timestamp version ID on upload @versioning-contract", async () => {
    const upload = await blockBlobClient.upload("version1", 8);

    assert.notStrictEqual(upload.versionId, undefined);
    assert.ok(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.test(upload.versionId!)
    );

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 1);
    assert.strictEqual(versions[0].versionId, upload.versionId);
    assert.strictEqual(versions[0].isCurrentVersion, true);
  });

  it("preserves overwritten content as a previous version @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);

    assert.notStrictEqual(first.versionId, second.versionId);
    assert.strictEqual(
      await bodyToString(await blockBlobClient.download(), 8),
      "version2"
    );
    assert.strictEqual(
      await bodyToString(
        await blockBlobClient.withVersion(first.versionId!).download(),
        8
      ),
      "version1"
    );

    const versions = await listVersions(blobName);
    assert.deepStrictEqual(
      versions.map((version) => version.versionId),
      [first.versionId, second.versionId]
    );
    assert.notStrictEqual(versions[0].isCurrentVersion, true);
    assert.strictEqual(versions[1].isCurrentVersion, true);
  });

  it("hides previous versions unless requested @versioning-contract", async () => {
    await blockBlobClient.upload("version1", 8);
    await blockBlobClient.upload("version2", 8);

    const currentItems = [];
    for await (const item of containerClient.listBlobsFlat()) {
      currentItems.push(item);
    }

    assert.strictEqual(currentItems.length, 1);
    assert.strictEqual(currentItems[0].name, blobName);
    assert.strictEqual((await listVersions(blobName)).length, 2);
  });

  it("reports current-version properties correctly @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);

    const current = await blockBlobClient.getProperties();
    assert.strictEqual(current.versionId, second.versionId);
    assert.strictEqual(current.isCurrentVersion, true);

    const currentByVersion = await blockBlobClient
      .withVersion(second.versionId!)
      .getProperties();
    assert.strictEqual(currentByVersion.versionId, second.versionId);
    assert.strictEqual(currentByVersion.isCurrentVersion, true);

    const previous = await blockBlobClient
      .withVersion(first.versionId!)
      .getProperties();
    assert.strictEqual(previous.versionId, first.versionId);
    assert.notStrictEqual(previous.isCurrentVersion, true);
  });

  it("returns 404 for an unknown version @versioning-contract", async () => {
    await blockBlobClient.upload("version1", 8);

    let error;
    try {
      await blockBlobClient
        .withVersion("2020-01-01T00:00:00.0000000Z")
        .download();
    } catch (err) {
      error = err;
    }

    assert.strictEqual((error as any)?.statusCode, 404);
  });

  it("deletes one previous version without affecting others @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);

    await blockBlobClient.withVersion(first.versionId!).delete();

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 1);
    assert.strictEqual(versions[0].versionId, second.versionId);
    assert.strictEqual(
      await bodyToString(await blockBlobClient.download(), 8),
      "version2"
    );
  });

  it("turns the current version into a previous version on delete @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);

    await blockBlobClient.delete();

    const versions = await listVersions(blobName);
    assert.deepStrictEqual(
      versions.map((version) => version.versionId),
      [first.versionId, second.versionId]
    );
    for (const version of versions) {
      assert.notStrictEqual(version.isCurrentVersion, true);
      assert.notStrictEqual(version.hasVersionsOnly, true);
    }
    assert.strictEqual(await blockBlobClient.exists(), false);
    assert.strictEqual(
      await bodyToString(
        await blockBlobClient.withVersion(first.versionId!).download(),
        8
      ),
      "version1"
    );
    assert.strictEqual(
      await bodyToString(
        await blockBlobClient.withVersion(second.versionId!).download(),
        8
      ),
      "version2"
    );
  });

  it("creates a new current version after delete @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);
    await blockBlobClient.delete();
    const third = await blockBlobClient.upload("version3", 8);

    const versions = await listVersions(blobName);
    assert.deepStrictEqual(
      versions.map((version) => version.versionId),
      [first.versionId, second.versionId, third.versionId]
    );
    assert.strictEqual(versions[2].isCurrentVersion, true);
  });

  it("retains versions when deleting snapshots with the blob @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const second = await blockBlobClient.upload("version2", 8);
    const snapshot = await blockBlobClient.createSnapshot();

    await blockBlobClient.delete({ deleteSnapshots: "include" });

    assert.deepStrictEqual(
      (await listVersions(blobName)).map((version) => version.versionId),
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
    assert.strictEqual(snapshotCount, 0);
  });

  it("verifies current-version deletion by version ID @versioning-contract", async () => {
    const only = await blockBlobClient.upload("version1", 8);

    let error;
    try {
      await blockBlobClient.withVersion(only.versionId!).delete();
    } catch (err) {
      error = err;
    }

    assert.strictEqual((error as any)?.statusCode, 403);
    assert.strictEqual((error as any)?.code, "OperationNotAllowedOnRootBlob");
  });

  it("restores by copying a previous version @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    await blockBlobClient.upload("version2", 8);

    const poller = await blockBlobClient.beginCopyFromURL(
      blockBlobClient.withVersion(first.versionId!).url
    );
    await poller.pollUntilDone();

    assert.strictEqual(
      await bodyToString(await blockBlobClient.download(), 8),
      "version1"
    );
  });

  it("rejects snapshot and version ID together @versioning-contract", async () => {
    const upload = await blockBlobClient.upload("version1", 8);
    const snapshot = await blockBlobClient.createSnapshot();

    let error;
    try {
      await blockBlobClient
        .withSnapshot(snapshot.snapshot!)
        .withVersion(upload.versionId!)
        .download();
    } catch (err) {
      error = err;
    }

    assert.strictEqual((error as any)?.statusCode, 400);
    assert.strictEqual(
      (error as any)?.code,
      "MutuallyExclusiveQueryParameters"
    );
  });

  it("creates a version when committing a block list @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const blockId = Buffer.from("block-1").toString("base64");
    await blockBlobClient.stageBlock(blockId, "version2", 8);
    const commit = await blockBlobClient.commitBlockList([blockId]);

    assert.notStrictEqual(commit.versionId, undefined);
    assert.notStrictEqual(commit.versionId, first.versionId);
    assert.deepStrictEqual(
      (await listVersions(blobName)).map((version) => version.versionId),
      [first.versionId, commit.versionId]
    );
  });

  it("paginates through all versions of one blob @versioning-contract", async () => {
    const expected: string[] = [];
    for (let i = 0; i < 5; i++) {
      const upload = await blockBlobClient.upload(`v${i}`, 2);
      expected.push(`${blobName}@${upload.versionId}`);
    }

    const { seen, pages } = await pageThroughVersions(2);
    assert.ok(pages > 1);
    assert.deepStrictEqual(seen, expected);
  });

  it("paginates through versions across blobs @versioning-contract", async () => {
    const expected: string[] = [];
    for (const suffix of ["a", "b", "c"]) {
      const name = `${blobName}-${suffix}`;
      const client = containerClient.getBlockBlobClient(name);
      for (let i = 0; i < 3; i++) {
        const upload = await client.upload(`v${i}`, 2);
        expected.push(`${name}@${upload.versionId}`);
      }
    }

    const { seen, pages } = await pageThroughVersions(2);
    assert.ok(pages > 1);
    assert.deepStrictEqual(seen, expected);
  });

  it("keeps non-version pagination unchanged @versioning-contract", async () => {
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
      if (result.done) {
        break;
      }
      seen.push(...result.value.segment.blobItems.map((item) => item.name));
      continuationToken = result.value.continuationToken;
    } while (continuationToken);

    assert.deepStrictEqual(seen, names);
  });

  it("creates a version when setting metadata @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const result = await blockBlobClient.setMetadata({ k: "v2" });

    assert.notStrictEqual(result.versionId, undefined);
    assert.notStrictEqual(result.versionId, first.versionId);
    assert.deepStrictEqual(
      (await listVersions(blobName)).map((version) => version.versionId),
      [first.versionId, result.versionId]
    );
    assert.deepStrictEqual(
      (await blockBlobClient.withVersion(first.versionId!).getProperties())
        .metadata ?? {},
      {}
    );
    assert.deepStrictEqual((await blockBlobClient.getProperties()).metadata, {
      k: "v2"
    });
  });

  it("does not create a version when setting properties @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    await blockBlobClient.setHTTPHeaders({
      blobContentType: "text/plain"
    });

    const versions = await listVersions(blobName);
    assert.strictEqual(versions.length, 1);
    assert.strictEqual(versions[0].versionId, first.versionId);
    assert.strictEqual(
      (await blockBlobClient.getProperties()).contentType,
      "text/plain"
    );

    const pageName = getUniqueName("page");
    const pageClient = containerClient.getPageBlobClient(pageName);
    await pageClient.create(512);
    await pageClient.setHTTPHeaders({ blobContentType: "text/plain" });
    assert.strictEqual((await listVersions(pageName)).length, 1);
  });

  it("versions page and append blob creates only on supported writes @versioning-contract", async () => {
    const pageName = getUniqueName("page");
    const pageClient = containerClient.getPageBlobClient(pageName);
    assert.notStrictEqual((await pageClient.create(512)).versionId, undefined);
    await pageClient.uploadPages("x".repeat(512), 0, 512);
    assert.strictEqual((await listVersions(pageName)).length, 1);

    const appendName = getUniqueName("append");
    const appendClient = containerClient.getAppendBlobClient(appendName);
    assert.notStrictEqual((await appendClient.create()).versionId, undefined);
    await appendClient.appendBlock("y", 1);
    assert.strictEqual((await listVersions(appendName)).length, 1);

    assert.notStrictEqual(
      (await pageClient.setMetadata({ k: "v" })).versionId,
      undefined
    );
    assert.notStrictEqual(
      (await appendClient.setMetadata({ k: "v" })).versionId,
      undefined
    );
  });

  it("creates a version when taking a snapshot @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    const snapshot = await blockBlobClient.createSnapshot();

    assert.notStrictEqual(snapshot.snapshot, undefined);
    assert.notStrictEqual(snapshot.versionId, undefined);
    assert.notStrictEqual(snapshot.versionId, first.versionId);
    assert.deepStrictEqual(
      (await listVersions(blobName)).map((version) => version.versionId),
      [first.versionId, snapshot.versionId]
    );
  });

  it("returns the destination version ID from copy @versioning-contract", async () => {
    const source = containerClient.getBlockBlobClient(getUniqueName("src"));
    await source.upload("source12", 8);
    const first = await blockBlobClient.upload("version1", 8);

    const poller = await blockBlobClient.beginCopyFromURL(source.url);
    const copy = await poller.pollUntilDone();

    assert.notStrictEqual(copy.versionId, undefined);
    assert.notStrictEqual(copy.versionId, first.versionId);
    assert.deepStrictEqual(
      (await listVersions(blobName)).map((version) => version.versionId),
      [first.versionId, copy.versionId]
    );
  });

  it("keeps tags isolated per version @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    await blockBlobClient.setTags({ tier: "old" });
    await blockBlobClient.upload("version2", 8);
    await blockBlobClient.setTags({ tier: "new" });

    assert.deepStrictEqual((await blockBlobClient.getTags()).tags, {
      tier: "new"
    });
    assert.deepStrictEqual(
      (await blockBlobClient.withVersion(first.versionId!).getTags()).tags,
      { tier: "old" }
    );

    await blockBlobClient
      .withVersion(first.versionId!)
      .setTags({ tier: "archived" });
    assert.deepStrictEqual(
      (await blockBlobClient.withVersion(first.versionId!).getTags()).tags,
      { tier: "archived" }
    );
  });

  it("sets access tier independently per version @versioning-contract", async () => {
    const first = await blockBlobClient.upload("version1", 8);
    await blockBlobClient.upload("version2", 8);

    await blockBlobClient.withVersion(first.versionId!).setAccessTier("Cool");

    assert.strictEqual(
      (await blockBlobClient.withVersion(first.versionId!).getProperties())
        .accessTier,
      "Cool"
    );
    assert.notStrictEqual(
      (await blockBlobClient.getProperties()).accessTier,
      "Cool"
    );
  });

  it("rejects malformed version IDs @versioning-contract", async () => {
    await blockBlobClient.upload("version1", 8);

    for (const invalid of [
      "notatimestamp",
      "2026-08-13",
      "2026-08-13T10:00:00Z"
    ]) {
      let error;
      try {
        await blockBlobClient.withVersion(invalid).download();
      } catch (err) {
        error = err;
      }

      assert.strictEqual((error as any)?.statusCode, 400);
      assert.strictEqual((error as any)?.code, "InvalidQueryParameterValue");
    }
  });

  it("keeps snapshots blocking base-blob deletion @versioning-contract", async () => {
    await blockBlobClient.upload("version1", 8);
    await blockBlobClient.createSnapshot();

    let error;
    try {
      await blockBlobClient.delete();
    } catch (err) {
      error = err;
    }

    assert.strictEqual((error as any)?.statusCode, 409);
  });
});
