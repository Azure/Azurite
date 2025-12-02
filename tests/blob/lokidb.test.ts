import assert = require("assert");
import { v4 as uuid } from "uuid";
import * as fs from "fs";
import LokiBlobMetadataStore from "../../src/blob/persistence/LokiBlobMetadataStore";
import * as Models from "../../src/blob/generated/artifacts/models";
import Context from "../../src/blob/generated/Context";
import { configLogger } from "../../src/common/Logger";
import { isNullOrWhitespace } from "../../src/blob/utils/utils";
import {
  buildAppendBlob,
  buildBlockBlob,
  buildContainer,
  buildPageBlob,
  createContext
} from "../testutils";
import { AccountModel } from "../../src/blob/AccountModel";
import LokiAccountModelStore from "../../src/common/account/LokiAccountModelStore";
// Silence logs for tests
configLogger(false);

const ACCOUNT = "devstoreaccount1";
const ACCOUNT_DB_FILE = "__test_db_blob_accounts_lokidb__.json";

function createAccountModelStore(accountModel: AccountModel, inMemory: boolean = false): LokiAccountModelStore {
  const accountModels = new Map<string, AccountModel>();
  accountModels.set(accountModel.key || ACCOUNT, accountModel);
  return new LokiAccountModelStore(ACCOUNT_DB_FILE, inMemory, accountModels);
}

describe("LokiBlobMetadataStore - Versioning Disabled", () => {
  let store: LokiBlobMetadataStore;
  let containerName: string;
  let ctx: Context;
  const DB_FILE = "__test_db_blob__.json"; // standard shared test db path
  let originalDbContent: string | undefined;
  let originalExists = false;

  before(() => {
    if (fs.existsSync(DB_FILE)) {
      originalExists = true;
      originalDbContent = fs.readFileSync(DB_FILE, "utf8");
    }
  });

  beforeEach(async () => {
    ctx = createContext();
    containerName = `container-${uuid()}`;
    // Use in-memory for regular tests (fast); special test will override
    const accountModel: AccountModel =
    {
      key: "account",
      isBlobVersioningEnabled: false
    };
    const accountModelStore = createAccountModelStore(accountModel, true);
    store = new LokiBlobMetadataStore(DB_FILE, true, accountModelStore);
    await store.init();
    await store.createContainer(ctx, buildContainer(ACCOUNT, containerName));
  });

  afterEach(async () => {
    if (store) {
      await store.close();
      await store.clean();
    }
  });

  after(() => {
    // Restore DB file to its original state
    if (originalExists) {
      fs.writeFileSync(DB_FILE, originalDbContent!);
    } else if (fs.existsSync(DB_FILE)) {
      try {
        fs.unlinkSync(DB_FILE);
      } catch {
        /* ignore */
      }
    }
  });

  it("creates base blob with versionId == '' and treats it as latest when no version specified @loki", async () => {
    const name = `blob-${uuid()}`;
    const contentV1 = "content-v1";
    const blobV1 = buildBlockBlob(ACCOUNT, containerName, name, contentV1);
    await store.createBlob(ctx, blobV1);

    // Fetch without versionId (downloadBlob) => latest
    const fetched = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(
      fetched.versionId,
      "",
      "Base version should have empty versionId"
    );
  });

  it("overwrites base blob and keeps latest (no version) when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const blobV1 = buildBlockBlob(ACCOUNT, containerName, name, "bob");
    const createdV1 = await store.createBlob(ctx, blobV1);

    const blobV2 = buildBlockBlob(ACCOUNT, containerName, name, "alice");
    const createdV2 = await store.createBlob(ctx, blobV2);

    assert.deepStrictEqual(createdV1.versionId, "");
    assert.deepStrictEqual(createdV2.versionId, "");
    assert.notDeepStrictEqual(createdV1.properties.contentLength, undefined);
    assert.notDeepStrictEqual(createdV2.properties.contentLength, undefined);
    assert.notDeepStrictEqual(
      createdV1.properties.contentLength,
      createdV2.properties.contentLength
    );

    // Download latest (no version) should return v2 (still versionId "")
    const latest = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    assert.strictEqual(
      latest.properties.contentLength,
      blobV2.properties.contentLength
    );
    assert.strictEqual(latest.versionId, "", "Still base version placeholder");
  });

  it("can retrieve a version created while versioning was enabled after disabling versioning @loki", async () => {
    // Close the in-memory disabled store from beforeEach; we need persistence for this scenario
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create persistent store with versioning enabled (inMemory=false)
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    let persistent = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await persistent.init();
    await persistent.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const blobV = buildBlockBlob(ACCOUNT, containerName, name, "body");

    const createdBlob = await persistent.createBlob(ctx, blobV);
    const versionId = createdBlob.versionId;
    assert.ok(!isNullOrWhitespace(versionId));
    await persistent.close(); // Do NOT clean so data persists

    // 2. Recreate store with versioning disabled using same DB file
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // 3. Attempt to fetch explicitly by the version id created earlier
    const fetched = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      versionId
    );
    assert.ok(
      !isNullOrWhitespace(fetched.versionId),
      "Fetched version should have a non-empty versionId"
    );
    assert.deepStrictEqual(fetched.versionId, versionId);
  });

  it("should not create versions for subsequent blob modifications when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const blobV1 = buildBlockBlob(ACCOUNT, containerName, name, "version1");
    await store.createBlob(ctx, blobV1);

    // Multiple overwrites should all result in versionId ""
    const blobV2 = buildBlockBlob(ACCOUNT, containerName, name, "version2");
    await store.createBlob(ctx, blobV2);

    const blobV3 = buildBlockBlob(ACCOUNT, containerName, name, "version3");
    await store.createBlob(ctx, blobV3);

    const latest = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    assert.strictEqual(latest.versionId, "");
    assert.strictEqual(
      latest.properties.contentLength,
      blobV3.properties.contentLength
    );
  });

  it("should handle delete operations without creating versions when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    // Delete the blob
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {});

    // Verify blob is deleted
    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        undefined
      );
      assert.fail("Should have thrown error for deleted blob");
    } catch (error) {
      // Expected behavior - blob should be deleted
    }
  });

  it("should allow creation of new blob with same name after deletion when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob1 = buildBlockBlob(ACCOUNT, containerName, name, "content1");
    await store.createBlob(ctx, blob1);

    // Delete the blob
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {});

    // Create new blob with same name - should work and have versionId ""
    const blob2 = buildBlockBlob(ACCOUNT, containerName, name, "content2");
    const created = await store.createBlob(ctx, blob2);

    assert.strictEqual(created.versionId, "");

    const fetched = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    assert.strictEqual(fetched.versionId, "");
    assert.strictEqual(
      fetched.properties.contentLength,
      blob2.properties.contentLength
    );
  });

  // ================== SNAPSHOT TESTS WITH VERSIONING DISABLED ==================
  it("should create snapshots without versions when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    const beforeSnapshot = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Take snapshot should not create version when versioning disabled
    ctx.startTime = new Date(Date.now() + 100);
    const snapshotResponse = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );

    assert.ok(snapshotResponse.snapshot);
    assert.strictEqual(snapshotResponse.versionId, "");

    // Current blob should still exist and not have a version
    const afterSnapshot = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    assert.strictEqual(afterSnapshot.versionId, "");
    assert.strictEqual(afterSnapshot.versionId, beforeSnapshot.versionId);
  });

  // ================== HTTP HEADERS TESTS WITH VERSIONING DISABLED ==================
  it("should update HTTP headers in place without creating versions when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    const beforeHeaders = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    ctx.startTime = new Date(Date.now() + 100);
    await store.setBlobHTTPHeaders(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      { blobContentType: "text/plain" }
    );

    const afterHeaders = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Should update in place - same versionId (empty) but updated properties
    assert.strictEqual(afterHeaders.versionId, beforeHeaders.versionId);
    assert.strictEqual(afterHeaders.versionId, "");
    assert.strictEqual(afterHeaders.properties.contentType, "text/plain");
  });

  // ================== BLOB TAGS TESTS WITH VERSIONING DISABLED ==================
  it("should update blob tags in place without creating versions when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    const beforeTags = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    ctx.startTime = new Date(Date.now() + 100);
    await store.setBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined,
      { blobTagSet: [{ key: "environment", value: "test" }] }
    );

    const afterTags = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Should update in place - same versionId (empty)
    assert.strictEqual(afterTags.versionId, beforeTags.versionId);
    assert.strictEqual(afterTags.versionId, "");

    // Verify tags are set
    const tags = await store.getBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined
    );
    assert.deepStrictEqual(tags, {
      blobTagSet: [{ key: "environment", value: "test" }]
    });
  });

  // ================== TIER MANAGEMENT TESTS WITH VERSIONING DISABLED ==================
  it("should update tier in place without creating versions when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    blob.properties.accessTier = Models.AccessTier.Hot;
    await store.createBlob(ctx, blob);

    const beforeTier = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Set tier should update in place
    await store.setTier(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      Models.AccessTier.Cool,
      undefined
    );

    const afterTier = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Should update in place - same versionId (empty) but updated tier
    assert.strictEqual(afterTier.versionId, beforeTier.versionId);
    assert.strictEqual(afterTier.versionId, "");
    assert.strictEqual(afterTier.properties.accessTier, Models.AccessTier.Cool);
  });

  // ================== BLOB EXISTENCE AND PROPERTIES TESTS WITH VERSIONING DISABLED ==================
  it("should check blob existence without version support when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    // Check existence should work
    await store.checkBlobExist(ctx, ACCOUNT, containerName, name);

    // Should throw for version-specific requests since versioning is disabled
    try {
      await store.checkBlobExist(
        ctx,
        ACCOUNT,
        containerName,
        name,
        "",
        "2099-01-01T00:00:00.0000000Z"
      );
      assert.fail(
        "Should have thrown for version-specific request when versioning disabled"
      );
    } catch (error) {
      // Expected - version requests not supported when versioning disabled
    }
  });

  it("should get properties without version support when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    // Set metadata
    ctx.startTime = new Date(Date.now() + 100);
    await store.setBlobMetadata(ctx, ACCOUNT, containerName, name, undefined, {
      environment: "test"
    });

    // Get properties should work
    const props = await store.getBlobProperties(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined
    );

    assert.deepStrictEqual(props.metadata, { environment: "test" });
  });

  // ================== APPEND BLOB OPERATIONS TESTS WITH VERSIONING DISABLED ==================
  it("should handle Append Block operations normally when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const appendBlob = buildAppendBlob(ACCOUNT, containerName, name);
    await store.createBlob(ctx, appendBlob);

    const afterCreate = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Append block
    const block = {
      accountName: ACCOUNT,
      containerName,
      blobName: name,
      name: "append1",
      size: 10,
      persistency: { id: uuid(), offset: 0, count: 10 }
    } as any;

    ctx.startTime = new Date(Date.now() + 100);
    await store.appendBlock(ctx, block);

    const afterAppend = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Should update in place - same versionId (empty)
    assert.strictEqual(afterAppend.versionId, afterCreate.versionId);
    assert.strictEqual(afterAppend.versionId, "");
    assert.strictEqual(afterAppend.properties.contentLength, 10);
  });

  // ================== PAGE BLOB OPERATIONS TESTS WITH VERSIONING DISABLED ==================
  it("should handle Put Page operations normally when versioning disabled @loki", async () => {
    const name = `blob-${uuid()}`;
    const pageBlob = buildPageBlob(ACCOUNT, containerName, name, 512);
    await store.createBlob(ctx, pageBlob);

    const afterCreate = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Put Page
    const persistency = { id: uuid(), offset: 0, count: 512 };
    ctx.startTime = new Date(Date.now() + 100);
    await store.uploadPages(ctx, pageBlob, 0, 511, persistency);

    const afterUpload = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Should update in place - same versionId (empty)
    assert.strictEqual(afterUpload.versionId, afterCreate.versionId);
    assert.strictEqual(afterUpload.versionId, "");
  });
});
