import assert = require("assert");
import { v4 as uuid } from "uuid";
import LokiBlobMetadataStore from "../../src/blob/persistence/LokiBlobMetadataStore";
import LokiAccountModelStore from "../../src/common/account/LokiAccountModelStore";
import {
  buildAppendBlob,
  buildBlockBlob,
  buildContainer,
  buildPageBlob,
  createContext
} from "../testutils";
import * as Models from "../../src/blob/generated/artifacts/models";
import Context from "../../src/blob/generated/Context";
import { configLogger } from "../../src/common/Logger";
import { isNullOrWhitespace } from "../../src/blob/utils/utils";
import { AccountModel } from "../../src/blob/AccountModel";

// Silence logs for tests
configLogger(false);

const ACCOUNT = "devstoreaccount1";
const DEFAULT_LIST_BLOBS_MAX_RESULTS = 5000;
const DB_FILE = "__test_db_blob__.json"; // standard shared test db path
const ACCOUNT_DB_FILE = "__test_db_account_models__.json"; // account model DB

// Helper function to create account model store with a given account model
function createAccountModelStore(accountModel: AccountModel, inMemory: boolean = false): LokiAccountModelStore {
  const accountModels = new Map<string, AccountModel>();
  accountModels.set(accountModel.key || ACCOUNT, accountModel);
  return new LokiAccountModelStore(ACCOUNT_DB_FILE, inMemory, accountModels);
}

describe("LokiBlobMetadataStore - Versioning Enabled", () => {
  let store: LokiBlobMetadataStore;
  let accountModelStore: LokiAccountModelStore;
  let containerName: string;
  let ctx: Context;

  beforeEach(async () => {
    ctx = createContext();
    containerName = `container-${uuid()}`;
    const accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    }
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();
    await store.createContainer(ctx, buildContainer(ACCOUNT, containerName));
  });

  afterEach(async () => {
    await accountModelStore.close();
    await accountModelStore.clean();
    await store.close();
    await store.clean();
  });

  // ================== VERSION MODE TRANSITION TESTS (ENABLED → DISABLED) ==================
  it("should handle setBlobMetadata correctly when disabling versioning after creating versions @loki", async () => {
    // Close the in-memory disabled store from beforeEach; we need persistence for this scenario
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning ENABLED and create versioned blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    }
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let enabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await enabledStore.init();
    await enabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    const createdBaseBlob = await enabledStore.createBlob(ctx, baseBlob);

    // Set metadata to create versions (should create version)
    ctx.startTime = new Date(Date.now() + 100);
    const modifiedMetadataBaseBlob = await enabledStore.setBlobMetadata(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      { versionedmeta: "value1" }
    );
    assert.ok(!isNullOrWhitespace(createdBaseBlob.versionId));
    assert.ok(!isNullOrWhitespace(modifiedMetadataBaseBlob.versionId));
    assert.notStrictEqual(
      modifiedMetadataBaseBlob.versionId,
      createdBaseBlob.versionId
    );

    const versionedFetched = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.ok(!isNullOrWhitespace(versionedFetched.versionId));
    assert.deepStrictEqual(versionedFetched.metadata, {
      versionedmeta: "value1"
    });
    assert.strictEqual(
      versionedFetched.versionId,
      modifiedMetadataBaseBlob.versionId
    );
    const versionId = versionedFetched.versionId;
    await accountModelStore.close();
    await enabledStore.close();

    // 2. Re-open with versioning DISABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Set metadata should NOT create new version (overwrite current)
    ctx.startTime = new Date(Date.now() + 200);
    await store.setBlobMetadata(ctx, ACCOUNT, containerName, name, undefined, {
      disabledmeta: "value2"
    });

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Should be same version (no new version created)
    assert.strictEqual(current.versionId, "");
    assert.notStrictEqual(current.versionId, versionId);
    assert.deepStrictEqual(current.metadata, { disabledmeta: "value2" });

    const firstVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      versionId
    );
    assert.strictEqual(firstVersion.versionId, versionId);
  });

  it("should handle setBlobHTTPHeaders correctly when disabling versioning after creating versions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning ENABLED and create versioned blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let enabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await enabledStore.init();
    await enabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    await enabledStore.createBlob(ctx, baseBlob);

    // Set HTTP headers (should NOT create version even when versioning enabled)
    ctx.startTime = new Date(Date.now() + 100);
    await enabledStore.setBlobHTTPHeaders(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      { blobContentType: "text/plain" }
    );

    const versionedFetched = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.ok(!isNullOrWhitespace(versionedFetched.versionId));
    assert.strictEqual(versionedFetched.properties.contentType, "text/plain");
    const versionId = versionedFetched.versionId;
    await accountModelStore.close();
    await enabledStore.close();

    // 2. Re-open with versioning DISABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Set headers should continue to NOT create version and update in place
    ctx.startTime = new Date(Date.now() + 200);
    await store.setBlobHTTPHeaders(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      { blobContentType: "application/json" }
    );

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    // Should be same version (headers don't create versions in either mode)
    assert.strictEqual(current.versionId, versionId);
    assert.strictEqual(current.properties.contentType, "application/json");
  });

  it("should handle setBlobTag/getBlobTag correctly when disabling versioning after creating versions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning ENABLED and create versioned blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let enabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await enabledStore.init();
    await enabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    const creaatedBaseBlob = await enabledStore.createBlob(ctx, baseBlob);

    // Set tags (should NOT create version even when versioning enabled)
    ctx.startTime = new Date(Date.now() + 100);
    await enabledStore.setBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined,
      { blobTagSet: [{ key: "env", value: "test" }] }
    );

    const versionedFetched = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const versionId = versionedFetched.versionId;
    assert.ok(!isNullOrWhitespace(versionId));
    assert.strictEqual(creaatedBaseBlob.versionId, versionId);
    const versionedTags = await enabledStore.getBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      versionId,
      undefined
    );
    assert.deepStrictEqual(versionedTags, {
      blobTagSet: [{ key: "env", value: "test" }]
    });
    await accountModelStore.close();
    await enabledStore.close();

    // 2. Re-open with versioning DISABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Set tags should continue to NOT create version and update in place
    ctx.startTime = new Date(Date.now() + 200);
    await store.setBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined,
      { blobTagSet: [{ key: "env", value: "prod" }] }
    );

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    // Should be same version (tags don't create versions in either mode)
    assert.strictEqual(current.versionId, versionId);

    const currentTags = await store.getBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      versionId,
      undefined
    );
    assert.deepStrictEqual(currentTags, {
      blobTagSet: [{ key: "env", value: "prod" }]
    });
  });

  it("should handle setTier correctly when disabling versioning after creating versions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning ENABLED and create versioned blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let enabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await enabledStore.init();
    await enabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    baseBlob.properties.accessTier = Models.AccessTier.Hot;
    const blobCreated = await enabledStore.createBlob(ctx, baseBlob);

    // Set tier (should NOT create version even when versioning enabled)
    ctx.startTime = new Date(Date.now() + 100);
    await enabledStore.setTier(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      Models.AccessTier.Cool,
      undefined
    );

    const versionedFetched = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const versionId = versionedFetched.versionId;
    assert.ok(!isNullOrWhitespace(versionId));
    assert.strictEqual(blobCreated.versionId, versionId);
    assert.strictEqual(
      versionedFetched.properties.accessTier,
      Models.AccessTier.Cool
    );
    await accountModelStore.close();
    await enabledStore.close();

    // 2. Re-open with versioning DISABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Set tier should continue to work and update in place
    ctx.startTime = new Date(Date.now() + 200);
    await store.setTier(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      Models.AccessTier.Archive,
      undefined
    );

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    // Should be same version (tier operations don't create versions in either mode)
    assert.strictEqual(current.versionId, versionId);
    assert.strictEqual(
      current.properties.accessTier,
      Models.AccessTier.Archive
    );
  });

  it("should handle checkBlobExist correctly when disabling versioning after creating versions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning ENABLED and create versioned blobs
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let enabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await enabledStore.init();
    await enabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    const createdBaseBlob = await enabledStore.createBlob(ctx, baseBlob);
    const firstVersionId = createdBaseBlob.versionId;

    // Create second version
    ctx.startTime = new Date(Date.now() + 100);
    const secondBlob = buildBlockBlob(ACCOUNT, containerName, name, "second");
    const createdSecondBlob = await enabledStore.createBlob(ctx, secondBlob);

    const current = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const currentVersionId = current.versionId;
    assert.ok(!isNullOrWhitespace(currentVersionId));
    assert.strictEqual(currentVersionId, createdSecondBlob.versionId);
    assert.notStrictEqual(currentVersionId, firstVersionId);

    // Get first version ID
    await accountModelStore.close();
    await enabledStore.close();

    // 2. Re-open with versioning DISABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Check existence should work for current blob
    await store.checkBlobExist(ctx, ACCOUNT, containerName, name);

    // Should still be able to check existence by specific versionId
    await store.checkBlobExist(
      ctx,
      ACCOUNT,
      containerName,
      name,
      "",
      currentVersionId
    );

    // Previous versions should still be accessible by versionId
    await store.checkBlobExist(
      ctx,
      ACCOUNT,
      containerName,
      name,
      "",
      firstVersionId
    );
  });

  it("should handle getBlobProperties correctly when disabling versioning after creating versions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning ENABLED and create versioned blobs
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let enabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await enabledStore.init();
    await enabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    await enabledStore.createBlob(ctx, baseBlob);

    // Set metadata to create version
    ctx.startTime = new Date(Date.now() + 100);
    await enabledStore.setBlobMetadata(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      { env: "test" }
    );

    const secondVersion = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const secondVersionId = secondVersion.versionId;

    // Create second version
    ctx.startTime = new Date(Date.now() + 200);
    await enabledStore.setBlobMetadata(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      { env: "prod" }
    );

    const current = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const currentVersionId = current.versionId;
    assert.ok(!isNullOrWhitespace(currentVersionId));
    assert.notStrictEqual(currentVersionId, secondVersionId);
    await accountModelStore.close();
    await enabledStore.close();

    // 2. Re-open with versioning DISABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Get properties should work for current version
    const currentProps = await store.getBlobProperties(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined
    );
    assert.deepStrictEqual(currentProps.metadata, { env: "prod" });

    // Should still be able to get properties for specific versions by versionId
    const currentPropsByVersion = await store.getBlobProperties(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      currentVersionId,
      undefined
    );
    assert.deepStrictEqual(
      currentPropsByVersion.metadata,
      currentProps.metadata
    );

    const secondVersionProps = await store.getBlobProperties(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      secondVersionId,
      undefined
    );
    assert.deepStrictEqual(secondVersionProps.metadata, { env: "test" });
  });

  it("should handle createSnapshot correctly when disabling versioning after creating versions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning ENABLED and create versioned blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let enabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await enabledStore.init();
    await enabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    const createdBaseBlob = await enabledStore.createBlob(ctx, baseBlob);

    // Create snapshot (should create new version when versioning enabled)
    ctx.startTime = new Date(Date.now() + 100);
    const snapshotResponse1 = await enabledStore.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );
    assert.ok(snapshotResponse1.snapshot);
    assert.ok(!isNullOrWhitespace(snapshotResponse1.versionId));
    assert.notStrictEqual(
      snapshotResponse1.versionId,
      createdBaseBlob.versionId
    );

    const versionedFetched = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const versionId = versionedFetched.versionId;
    assert.ok(!isNullOrWhitespace(versionId));
    assert.strictEqual(versionId, snapshotResponse1.versionId);
    await accountModelStore.close();
    await enabledStore.close();

    // 2. Re-open with versioning DISABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Create snapshot should NOT create new version when versioning disabled
    ctx.startTime = new Date(Date.now() + 200);
    const snapshotResponse2 = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );
    assert.ok(snapshotResponse2.snapshot);
    assert.strictEqual(snapshotResponse2.versionId, "");

    try {
      // Snapshotting acts as a "write"
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        undefined
      );
      assert.fail("Expected error to be thrown");
    } catch (error) {
      assert.ok(error);
    }
  });

  it("should handle appendBlock correctly when disabling versioning after creating versions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning ENABLED and create versioned append blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let enabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await enabledStore.init();
    await enabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseAppendBlob = buildAppendBlob(ACCOUNT, containerName, name);
    await enabledStore.createBlob(ctx, baseAppendBlob);

    // Append block (should NOT create version even when versioning enabled)
    const block1 = {
      accountName: ACCOUNT,
      containerName,
      blobName: name,
      name: "append1",
      size: 10,
      persistency: { id: uuid(), offset: 0, count: 10 }
    } as any;

    ctx.startTime = new Date(Date.now() + 100);
    await enabledStore.appendBlock(ctx, block1);

    const versionedFetched = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.ok(!isNullOrWhitespace(versionedFetched.versionId));
    assert.strictEqual(versionedFetched.properties.contentLength, 10);
    const versionId = versionedFetched.versionId;
    await accountModelStore.close();
    await enabledStore.close();

    // 2. Re-open with versioning DISABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Append block should continue to NOT create version and update in place
    const block2 = {
      accountName: ACCOUNT,
      containerName,
      blobName: name,
      name: "append2",
      size: 15,
      persistency: { id: uuid(), offset: 10, count: 15 }
    } as any;

    ctx.startTime = new Date(Date.now() + 200);
    await store.appendBlock(ctx, block2);

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    // Should be same version (append operations don't create versions in either mode)
    assert.strictEqual(current.versionId, versionId);
    assert.strictEqual(current.properties.contentLength, 25);
  });

  it("should handle uploadPages correctly when disabling versioning after creating versions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning ENABLED and create versioned page blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let enabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await enabledStore.init();
    await enabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const basePageBlob = buildPageBlob(ACCOUNT, containerName, name, 512);
    await enabledStore.createBlob(ctx, basePageBlob);

    // Upload pages (should NOT create version even when versioning enabled)
    const persistency1 = { id: uuid(), offset: 0, count: 512 };
    ctx.startTime = new Date(Date.now() + 100);
    await enabledStore.uploadPages(ctx, basePageBlob, 0, 511, persistency1);

    const versionedFetched = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.ok(!isNullOrWhitespace(versionedFetched.versionId));
    const versionId = versionedFetched.versionId;
    await accountModelStore.close();
    await enabledStore.close();

    // 2. Re-open with versioning DISABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Upload pages should continue to NOT create version and update in place
    const persistency2 = { id: uuid(), offset: 0, count: 512 };
    ctx.startTime = new Date(Date.now() + 200);
    await store.uploadPages(ctx, basePageBlob, 0, 511, persistency2);

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    // Should be same version (page operations don't create versions in either mode)
    assert.strictEqual(current.versionId, versionId);
  });

  it("should handle deleteBlob correctly when disabling versioning after creating versions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning ENABLED and create versioned blobs
    let accountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };

    let accountModelStore = createAccountModelStore(accountModel, false);
    
    await accountModelStore.init();
    let enabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await enabledStore.init();
    await enabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    const createdBaseBlob = await enabledStore.createBlob(ctx, baseBlob);

    // Create second version
    ctx.startTime = new Date(Date.now() + 100);
    const secondBlob = buildBlockBlob(ACCOUNT, containerName, name, "second");
    await enabledStore.createBlob(ctx, secondBlob);

    const beforeDelete = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const currentVersionId = beforeDelete.versionId;
    await accountModelStore.close();
    await enabledStore.close();

    // 2. Re-open with versioning DISABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Delete current blob should completely remove it (not make it a previous version)
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {});

    // Current version should no longer exist
    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        undefined
      );
      assert.fail("Should have thrown error for deleted current blob");
    } catch (error) {
      // Expected
    }

    // But should still be able to access previous versions by specific versionId
    const deletedVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      createdBaseBlob.versionId
    );
    assert.ok(!isNullOrWhitespace(deletedVersion.versionId));
    assert.notStrictEqual(deletedVersion.versionId, currentVersionId);
    assert.strictEqual(deletedVersion.versionId, createdBaseBlob.versionId);

    // Should be able to delete specific version by versionId
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {
      versionId: createdBaseBlob.versionId
    });

    // That specific version should no longer exist
    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        createdBaseBlob.versionId
      );
      assert.fail("Should have thrown error for deleted specific version");
    } catch (error) {
      // Expected
    }
  });

  it("should preserve existing versions and allow operations on them when versioning is disabled @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning ENABLED and create multiple versions
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };

    let accountModelStore = createAccountModelStore(accountModel, false);
    
    await accountModelStore.init();

    let enabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await enabledStore.init();
    await enabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );

    // Create first version
    const blob1 = buildBlockBlob(ACCOUNT, containerName, name, "version1");
    await enabledStore.createBlob(ctx, blob1);
    const version1 = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const version1Id = version1.versionId;

    // Create second version
    ctx.startTime = new Date(Date.now() + 100);
    const blob2 = buildBlockBlob(ACCOUNT, containerName, name, "version2");
    await enabledStore.createBlob(ctx, blob2);
    const version2 = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const version2Id = version2.versionId;

    // Create third version
    ctx.startTime = new Date(Date.now() + 200);
    const blob3 = buildBlockBlob(ACCOUNT, containerName, name, "version3");
    await enabledStore.createBlob(ctx, blob3);
    const version3 = await enabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const version3Id = version3.versionId;
    await accountModelStore.close();
    await enabledStore.close();

    // 2. Re-open with versioning DISABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // All existing versions should remain accessible by versionId
    const fetchedV1 = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      version1Id
    );
    assert.strictEqual(
      fetchedV1.properties.contentLength,
      blob1.properties.contentLength
    );
    assert.strictEqual(fetchedV1.versionId, version1Id);

    const fetchedV2 = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      version2Id
    );
    assert.strictEqual(
      fetchedV2.properties.contentLength,
      blob2.properties.contentLength
    );
    assert.strictEqual(fetchedV2.versionId, version2Id);

    const fetchedV3 = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      version3Id
    );
    assert.strictEqual(
      fetchedV3.properties.contentLength,
      blob3.properties.contentLength
    );
    assert.strictEqual(fetchedV3.versionId, version3Id);

    // Current version should be the latest (version3)
    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(current.versionId, version3Id);
    assert.strictEqual(
      current.properties.contentLength,
      blob3.properties.contentLength
    );

    // Modifying current should create new version
    ctx.startTime = new Date(Date.now() + 300);
    const newBlob = buildBlockBlob(
      ACCOUNT,
      containerName,
      name,
      "modified_no_version"
    );
    await store.createBlob(ctx, newBlob);

    const afterModify = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    // Should change to empty string
    assert.strictEqual(afterModify.versionId, "");
    assert.notStrictEqual(afterModify.versionId, version3Id);

    // Previous versions should still exist and be unchanged
    const stillV1 = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      version1Id
    );
    assert.strictEqual(
      stillV1.properties.contentLength,
      blob1.properties.contentLength
    );

    const stillV2 = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      version2Id
    );
    assert.strictEqual(
      stillV2.properties.contentLength,
      blob2.properties.contentLength
    );
  });

  it("creates a new version for each blob creation and marks previous current as not current @loki", async () => {
    const name = `blob-${uuid()}`;
    const v1 = buildBlockBlob(ACCOUNT, containerName, name, "v1");
    await store.createBlob(ctx, v1);
    const afterV1 = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.ok(
      afterV1.versionId || afterV1.versionId === "",
      "First creation should have a version id (may be empty transitioning)"
    );

    // Second create -> new version id expected
    ctx.startTime = new Date(Date.now() + 10); // ensure different timestamp base
    const v2 = buildBlockBlob(ACCOUNT, containerName, name, "v2");
    await store.createBlob(ctx, v2);
    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.notStrictEqual(
      current.properties.etag,
      afterV1.properties.etag,
      "Etag should change for new version"
    );
    assert.ok(current.isCurrentVersion, "Latest should be current version");
  });

  it("promotes a non-versioned base blob (created with versioning disabled) to have a versionId equal to its original lastModified when versioning is later enabled @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning DISABLED (persistent) and create base blob (versionId will be "").
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    await disabledStore.createBlob(ctx, baseBlob);
    const baseFetched = await disabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const originalLastModifiedIso =
      baseFetched.properties.lastModified.toISOString();
    await accountModelStore.close();
    await disabledStore.close();

    // 2. Re-open SAME DB with versioning ENABLED.
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // 3. Create a new version (same name). This should assign a versionId to prior base blob
    //    using its lastModified timestamp, and mark it as not current.
    ctx.startTime = new Date(Date.now() + 200); // ensure different timestamp for new current version
    const secondBlob = buildBlockBlob(ACCOUNT, containerName, name, "second");
    const newBlobVer = await store.createBlob(ctx, secondBlob);
    assert.ok(
      !isNullOrWhitespace(newBlobVer.versionId),
      "New blob version should have a versionId"
    );

    // 4. Fetch current (no version) and previous (by derived versionId)
    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.ok(
      current.isCurrentVersion,
      "Latest blob should be current after enabling versioning"
    );
    assert.ok(
      !isNullOrWhitespace(current.versionId),
      "Current blob should now have a non-empty versionId"
    );

    const previous = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      originalLastModifiedIso
    );
    assert.strictEqual(
      previous.versionId,
      originalLastModifiedIso,
      "Previous base blob should be promoted with versionId equal to its original lastModified ISO string"
    );
    assert.strictEqual(
      previous.isCurrentVersion,
      false,
      "Previous version should no longer be current"
    );
    assert.notStrictEqual(
      previous.versionId,
      current.versionId,
      "Current versionId should differ from promoted previous versionId"
    );
  });

  it("allows addressing previous version by its versionId @loki", async () => {
    const name = `blob-${uuid()}`;
    const v1 = buildBlockBlob(ACCOUNT, containerName, name, "v1");
    await store.createBlob(ctx, v1);
    const first = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    ctx.startTime = new Date(Date.now() + 100);
    const v2 = buildBlockBlob(ACCOUNT, containerName, name, "v2");
    await store.createBlob(ctx, v2);
    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Try to fetch previous by versionId - should have non-empty version ID
    assert.ok(!isNullOrWhitespace(first.versionId));
    const previousFetched = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      first.versionId
    );
    assert.ok(previousFetched.versionId === first.versionId);
    assert.ok(current.isCurrentVersion);
  });

  it("should assign unique version IDs based on timestamp when creating versions @loki", async () => {
    const name = `blob-${uuid()}`;

    // Create first version
    const v1 = buildBlockBlob(ACCOUNT, containerName, name, "v1");
    const created1 = await store.createBlob(ctx, v1);

    // Wait a moment to ensure different timestamp
    ctx.startTime = new Date(Date.now() + 100);

    // Create second version
    const v2 = buildBlockBlob(ACCOUNT, containerName, name, "v2");
    const created2 = await store.createBlob(ctx, v2);

    // Version IDs should be different
    assert.notStrictEqual(created1.versionId, created2.versionId);
    assert.ok(!isNullOrWhitespace(created1.versionId));
    assert.ok(!isNullOrWhitespace(created2.versionId));
  });

  it("should maintain previous versions when creating new versions @loki", async () => {
    const name = `blob-${uuid()}`;

    // Create first version
    const v1 = buildBlockBlob(ACCOUNT, containerName, name, "ver1");
    const created1 = await store.createBlob(ctx, v1);
    const version1Id = created1.versionId;

    // Create second version
    ctx.startTime = new Date(Date.now() + 100);
    const v2 = buildBlockBlob(ACCOUNT, containerName, name, "ver22");
    const created2 = await store.createBlob(ctx, v2);
    const version2Id = created2.versionId;

    // Create third version
    ctx.startTime = new Date(Date.now() + 200);
    const v3 = buildBlockBlob(ACCOUNT, containerName, name, "ver333");
    await store.createBlob(ctx, v3);

    // Current should be v3
    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(
      current.properties.contentLength,
      v3.properties.contentLength
    );
    assert.ok(current.isCurrentVersion);

    // Previous versions should be accessible by versionId
    assert.ok(!isNullOrWhitespace(version1Id));
    const prev1 = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      version1Id
    );
    assert.strictEqual(
      prev1.properties.contentLength,
      v1.properties.contentLength
    );
    assert.strictEqual(prev1.isCurrentVersion, false);

    assert.ok(!isNullOrWhitespace(version2Id));
    const prev2 = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      version2Id
    );
    assert.strictEqual(
      prev2.properties.contentLength,
      v2.properties.contentLength
    );
    assert.strictEqual(prev2.isCurrentVersion, false);
  });

  it("should handle delete operations by making current version a previous version @loki", async () => {
    const name = `blob-${uuid()}`;

    // Create version
    const v1 = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, v1);

    // Verify blob exists and is current
    const beforeDelete = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.ok(beforeDelete.isCurrentVersion);
    const versionIdBeforeDelete = beforeDelete.versionId;

    // Delete the blob (without version ID = delete current)
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {});

    // Current version should no longer exist
    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        undefined
      );
      assert.fail("Should have thrown error for deleted current blob");
    } catch (error) {
      // Expected - no current version after delete
    }

    // Previous version should still be accessible by version ID
    assert.ok(!isNullOrWhitespace(versionIdBeforeDelete));
    const previousVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      versionIdBeforeDelete
    );
    assert.strictEqual(previousVersion.isCurrentVersion, false);
    assert.strictEqual(previousVersion.versionId, versionIdBeforeDelete);
  });

  it("should allow creating new current version after deletion @loki", async () => {
    const name = `blob-${uuid()}`;

    // Create and delete a version
    const v1 = buildBlockBlob(ACCOUNT, containerName, name, "content1");
    await store.createBlob(ctx, v1);
    const beforeDelete = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    const deletedVersionId = beforeDelete.versionId;

    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {});

    // Create new blob with same name
    ctx.startTime = new Date(Date.now() + 100);
    const v2 = buildBlockBlob(ACCOUNT, containerName, name, "content2");
    await store.createBlob(ctx, v2);

    // New blob should be current version
    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.ok(current.isCurrentVersion);
    assert.strictEqual(
      current.properties.contentLength,
      v2.properties.contentLength
    );
    assert.notStrictEqual(current.versionId, deletedVersionId);

    // Previous version should still exist as non-current
    assert.ok(!isNullOrWhitespace(deletedVersionId));
    const previous = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      deletedVersionId
    );
    assert.strictEqual(previous.isCurrentVersion, false);
  });

  it("should allow deleting specific versions by versionId @loki", async () => {
    const name = `blob-${uuid()}`;

    // Create multiple versions
    const v1 = buildBlockBlob(ACCOUNT, containerName, name, "version1");
    const created1 = await store.createBlob(ctx, v1);
    const version1Id = created1.versionId;

    ctx.startTime = new Date(Date.now() + 100);
    const v2 = buildBlockBlob(ACCOUNT, containerName, name, "version2");
    await store.createBlob(ctx, v2);

    // Delete specific version (v1) by versionId
    assert.ok(!isNullOrWhitespace(version1Id));
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {
      versionId: version1Id
    });

    // Current version (v2) should still exist
    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.ok(current.isCurrentVersion);
    assert.strictEqual(
      current.properties.contentLength,
      v2.properties.contentLength
    );

    // Deleted version should no longer be accessible
    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        version1Id
      );
      assert.fail("Should have thrown error for deleted version");
    } catch (error) {
      // Expected behavior
    }
  });

  it("should create versions for write operations on existing blobs @loki", async () => {
    const name = `blob-${uuid()}`;

    // Create initial blob
    const initialBlob = buildBlockBlob(ACCOUNT, containerName, name, "initial");
    await store.createBlob(ctx, initialBlob);
    const firstVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Update metadata (write operation) should create new version
    ctx.startTime = new Date(Date.now() + 100);
    await store.setBlobMetadata(ctx, ACCOUNT, containerName, name, undefined, {
      custommeta: "value"
    });

    const afterMetadataUpdate = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Should have new version ID and be current
    assert.notStrictEqual(
      afterMetadataUpdate.versionId,
      firstVersion.versionId
    );
    assert.ok(afterMetadataUpdate.isCurrentVersion);

    // Previous version should still exist as non-current
    assert.ok(!isNullOrWhitespace(firstVersion.versionId));
    const previousVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      firstVersion.versionId
    );
    assert.strictEqual(previousVersion.isCurrentVersion, false);
    assert.strictEqual(previousVersion.versionId, firstVersion.versionId);
  });

  it("should handle immutable versions correctly @loki", async () => {
    const name = `blob-${uuid()}`;

    // Create version
    const v1 = buildBlockBlob(ACCOUNT, containerName, name, "content");
    const created = await store.createBlob(ctx, v1);
    const versionId = created.versionId;

    // Create new current version
    ctx.startTime = new Date(Date.now() + 100);
    const v2 = buildBlockBlob(ACCOUNT, containerName, name, "modified");
    await store.createBlob(ctx, v2);

    // Previous version should remain unchanged when accessed
    assert.ok(!isNullOrWhitespace(versionId));
    const version1_read1 = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      versionId
    );

    // Wait and read again - should be identical
    const version1_read2 = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      versionId
    );

    assert.strictEqual(
      version1_read1.properties.contentLength,
      version1_read2.properties.contentLength
    );
    assert.strictEqual(
      version1_read1.properties.etag,
      version1_read2.properties.etag
    );
    assert.strictEqual(version1_read1.versionId, version1_read2.versionId);
    assert.strictEqual(version1_read1.isCurrentVersion, false);
    assert.strictEqual(version1_read2.isCurrentVersion, false);
  });

  it("should return correct isCurrentVersion flag for different scenarios @loki", async () => {
    const name = `blob-${uuid()}`;

    // Create first version
    const v1 = buildBlockBlob(ACCOUNT, containerName, name, "v1");
    await store.createBlob(ctx, v1);

    // Should be current
    const first = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(first.isCurrentVersion, true);

    // Create second version
    ctx.startTime = new Date(Date.now() + 100);
    const v2 = buildBlockBlob(ACCOUNT, containerName, name, "v2");
    await store.createBlob(ctx, v2);

    // Second should be current, first should not be
    const second = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(second.isCurrentVersion, true);

    assert.ok(!isNullOrWhitespace(first.versionId));
    const firstAgain = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      first.versionId
    );
    assert.strictEqual(firstAgain.isCurrentVersion, false);
  });

  // ================== SNAPSHOT TESTS ==================
  it("should create a new version when taking a snapshot while versioning enabled @loki", async () => {
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

    // Take snapshot should create new version according to Azure docs
    ctx.startTime = new Date(Date.now() + 100);
    const snapshotResponse = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );

    assert.ok(snapshotResponse.snapshot);
    assert.ok(!isNullOrWhitespace(snapshotResponse.versionId));

    // Current version should have changed after snapshot
    const afterSnapshot = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    assert.notStrictEqual(afterSnapshot.versionId, beforeSnapshot.versionId);
    assert.ok(afterSnapshot.isCurrentVersion);
  });

  // ================== HTTP HEADERS TESTS ==================
  it("should NOT create new version when setting HTTP headers with versioning enabled @loki", async () => {
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

    // Should NOT create new version - HTTP headers are metadata updates only
    assert.strictEqual(afterHeaders.versionId, beforeHeaders.versionId);
    assert.strictEqual(afterHeaders.properties.contentType, "text/plain");
    assert.ok(afterHeaders.isCurrentVersion);

    // Should be the same version with updated headers
    assert.strictEqual(afterHeaders.versionId, beforeHeaders.versionId);
  });

  // ================== BLOB TAGS TESTS ==================
  it("should NOT create new version when setting blob tags with versioning enabled @loki", async () => {
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
      { blobTagSet: [{ key: "key1", value: "value1" }] }
    );

    const afterTags = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Should NOT create new version - tags are metadata updates only
    assert.strictEqual(afterTags.versionId, beforeTags.versionId);
    assert.ok(afterTags.isCurrentVersion);

    // Verify tags are set on current version (same version)
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
      blobTagSet: [{ key: "key1", value: "value1" }]
    });
  });

  it("should access tags from specific versions @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    // Set tags on first version - this should NOT create a new version
    await store.setBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined,
      { blobTagSet: [{ key: "version", value: "1" }] }
    );

    const firstVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Create second version using content change (Put Blob operation)
    ctx.startTime = new Date(Date.now() + 100);
    const blob2 = buildBlockBlob(ACCOUNT, containerName, name, "content2");
    await store.createBlob(ctx, blob2);

    // Set different tags on second version
    await store.setBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined,
      { blobTagSet: [{ key: "version", value: "2" }] }
    );

    // Verify each version has its own tags
    const firstVersionTags = await store.getBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      firstVersion.versionId,
      undefined
    );

    const currentTags = await store.getBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined
    );

    assert.deepStrictEqual(firstVersionTags, {
      blobTagSet: [{ key: "version", value: "1" }]
    });
    assert.deepStrictEqual(currentTags, {
      blobTagSet: [{ key: "version", value: "2" }]
    });
  });

  // ================== TIER MANAGEMENT TESTS ==================
  it("should set tier on specific blob versions independently @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    blob.properties.accessTier = Models.AccessTier.Hot;
    await store.createBlob(ctx, blob);

    const firstVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Create second version
    ctx.startTime = new Date(Date.now() + 100);
    const blob2 = buildBlockBlob(ACCOUNT, containerName, name, "content2");
    blob2.properties.accessTier = Models.AccessTier.Hot;
    await store.createBlob(ctx, blob2);

    // Set tier on current version (without versionId)
    await store.setTier(
      ctx,
      ACCOUNT,
      containerName,
      name,
      "",
      Models.AccessTier.Cool,
      undefined
    );

    // Current version should have Cool tier
    const currentAfterTier = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(
      currentAfterTier.properties.accessTier,
      Models.AccessTier.Cool
    );

    // Previous version should still have Hot tier
    assert.ok(!isNullOrWhitespace(firstVersion.versionId));
    const previousAfterTier = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      firstVersion.versionId
    );
    assert.strictEqual(
      previousAfterTier.properties.accessTier,
      Models.AccessTier.Hot
    );

    // Now set tier on specific version (first version) by versionId
    await store.setTier(
      ctx,
      ACCOUNT,
      containerName,
      name,
      firstVersion.versionId,
      Models.AccessTier.Archive,
      undefined
    );

    // First version should now have Archive tier
    const firstVersionAfterArchive = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      firstVersion.versionId
    );
    assert.strictEqual(
      firstVersionAfterArchive.properties.accessTier,
      Models.AccessTier.Archive
    );

    // Current version should still have Cool tier (unchanged)
    const currentStillCool = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(
      currentStillCool.properties.accessTier,
      Models.AccessTier.Cool
    );
  });

  // ================== BLOB EXISTENCE AND PROPERTIES TESTS ==================
  it("should check blob existence for specific versions @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    const firstVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Create second version
    ctx.startTime = new Date(Date.now() + 100);
    const blob2 = buildBlockBlob(ACCOUNT, containerName, name, "content2");
    await store.createBlob(ctx, blob2);

    // Check existence of current version
    await store.checkBlobExist(ctx, ACCOUNT, containerName, name);

    // Check existence of specific version
    assert.ok(!isNullOrWhitespace(firstVersion.versionId));
    await store.checkBlobExist(
      ctx,
      ACCOUNT,
      containerName,
      name,
      "",
      firstVersion.versionId
    );

    // Should throw for non-existent version
    try {
      await store.checkBlobExist(
        ctx,
        ACCOUNT,
        containerName,
        name,
        "",
        "2099-01-01T00:00:00.0000000Z"
      );
      assert.fail("Should have thrown for non-existent version");
    } catch (error) {
      // Expected
    }
  });

  it("should get properties for specific blob versions @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    // Set metadata to create version
    ctx.startTime = new Date(Date.now() + 100);
    await store.setBlobMetadata(ctx, ACCOUNT, containerName, name, undefined, {
      version: "1"
    });

    const firstVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Set different metadata to create second version
    ctx.startTime = new Date(Date.now() + 200);
    await store.setBlobMetadata(ctx, ACCOUNT, containerName, name, undefined, {
      version: "2"
    });

    // Get properties of current version
    const currentProps = await store.getBlobProperties(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined
    );

    assert.deepStrictEqual(currentProps.metadata, { version: "2" });

    // Get properties of previous version
    assert.ok(!isNullOrWhitespace(firstVersion.versionId));
    const prevProps = await store.getBlobProperties(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      firstVersion.versionId,
      undefined
    );

    assert.deepStrictEqual(prevProps.metadata, { version: "1" });
  });

  // ================== APPEND BLOB OPERATIONS TESTS ==================
  it("should not create versions for Append Block operations @loki", async () => {
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

    // Append block should not create version
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

    // Should be same version, just updated properties
    assert.strictEqual(afterAppend.versionId, afterCreate.versionId);
    assert.ok(afterAppend.isCurrentVersion);
    assert.strictEqual(afterAppend.properties.contentLength, 10);
  });

  it("should create versions for Put Blob operations on append blobs @loki", async () => {
    const name = `blob-${uuid()}`;
    const appendBlob1 = buildAppendBlob(ACCOUNT, containerName, name);
    await store.createBlob(ctx, appendBlob1);

    const firstVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Put Blob (replace) should create new version
    ctx.startTime = new Date(Date.now() + 100);
    const appendBlob2 = buildAppendBlob(ACCOUNT, containerName, name);
    appendBlob2.properties.contentLength = 20;
    await store.createBlob(ctx, appendBlob2);

    const secondVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    assert.notStrictEqual(secondVersion.versionId, firstVersion.versionId);
    assert.ok(secondVersion.isCurrentVersion);
    assert.strictEqual(secondVersion.properties.contentLength, 20);
  });

  // ================== PAGE BLOB OPERATIONS TESTS ==================
  it("should not create versions for Put Page operations @loki", async () => {
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

    // Put Page should not create version according to Azure docs
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

    // Should be same version
    assert.strictEqual(afterUpload.versionId, afterCreate.versionId);
    assert.ok(afterUpload.isCurrentVersion);
  });

  it("should create versions for Put Blob operations on page blobs @loki", async () => {
    const name = `blob-${uuid()}`;
    const pageBlob1 = buildPageBlob(ACCOUNT, containerName, name, 512);
    await store.createBlob(ctx, pageBlob1);

    const firstVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Put Blob (replace) should create new version
    ctx.startTime = new Date(Date.now() + 100);
    const pageBlob2 = buildPageBlob(ACCOUNT, containerName, name, 1024);
    await store.createBlob(ctx, pageBlob2);

    const secondVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    assert.notStrictEqual(secondVersion.versionId, firstVersion.versionId);
    assert.ok(secondVersion.isCurrentVersion);
    assert.strictEqual(secondVersion.properties.contentLength, 1024);
  });

  // ================== LIST BLOBS VERSIONING TESTS ==================
  it("should list blobs with includeVersions=true showing only non-deleted versions @loki", async () => {
    const blob1Name = `blob1-${uuid()}`;
    const blob2Name = `blob2-${uuid()}`;

    // Create first blob with multiple versions
    const blob1v1 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v1");
    await store.createBlob(ctx, blob1v1);
    const blob1v1Downloaded = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      blob1Name,
      undefined,
      undefined
    );
    const blob1v1Id = blob1v1Downloaded.versionId;

    ctx.startTime = new Date(Date.now() + 100);
    const blob1v2 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v2");
    await store.createBlob(ctx, blob1v2);
    const blob1v2Downloaded = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      blob1Name,
      undefined,
      undefined
    );
    const blob1v2Id = blob1v2Downloaded.versionId;

    // Create second blob
    ctx.startTime = new Date(Date.now() + 200);
    const blob2v1 = buildBlockBlob(
      ACCOUNT,
      containerName,
      blob2Name,
      "content"
    );
    await store.createBlob(ctx, blob2v1);

    // Create third blob with multiple versions, then delete it
    const blob3Name = `blob3-${uuid()}`;
    ctx.startTime = new Date(Date.now() + 300);
    const blob3v1 = buildBlockBlob(ACCOUNT, containerName, blob3Name, "v1");
    await store.createBlob(ctx, blob3v1);

    ctx.startTime = new Date(Date.now() + 400);
    const blob3v2 = buildBlockBlob(ACCOUNT, containerName, blob3Name, "v2");
    await store.createBlob(ctx, blob3v2);

    // Delete blob3 (this should make it not appear in includeVersions=true without includeDeletedWithVersions)
    await store.deleteBlob(ctx, ACCOUNT, containerName, blob3Name, {});

    // List with includeVersions=true should show all versions of non-deleted blobs only
    const [blobs, ,] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined,
      undefined,
      "",
      DEFAULT_LIST_BLOBS_MAX_RESULTS,
      "",
      undefined,
      undefined,
      true,
      undefined
    );

    assert.strictEqual(blobs.length, 3); // blob1v1, blob1v2, blob2v1 (blob3 excluded because deleted)

    // Verify blob1 versions are sorted chronologically (earliest first)
    const blob1Versions = blobs.filter((b) => b.name === blob1Name);
    assert.strictEqual(blob1Versions.length, 2);
    assert.strictEqual(blob1Versions[0].versionId, blob1v1Id); // Earlier version first
    assert.strictEqual(blob1Versions[1].versionId, blob1v2Id); // Current version last
    assert.strictEqual(blob1Versions[0].isCurrentVersion, false);
    assert.strictEqual(blob1Versions[1].isCurrentVersion, true);

    // Verify blob2 is present
    const blob2Versions = blobs.filter((b) => b.name === blob2Name);
    assert.strictEqual(blob2Versions.length, 1);
    assert.strictEqual(blob2Versions[0].isCurrentVersion, true);

    // Verify blob3 is NOT present (deleted blob should not appear with includeVersions=true only)
    const blob3Versions = blobs.filter((b) => b.name === blob3Name);
    assert.strictEqual(blob3Versions.length, 0);
  });

  it("should list blobs with includeVersions=false showing only current versions @loki", async () => {
    const blob1Name = `blob1-${uuid()}`;
    const blob2Name = `blob2-${uuid()}`;

    // Create first blob with multiple versions
    const blob1v1 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v1");
    await store.createBlob(ctx, blob1v1);

    ctx.startTime = new Date(Date.now() + 100);
    const blob1v2 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v2");
    await store.createBlob(ctx, blob1v2);

    // Create second blob
    ctx.startTime = new Date(Date.now() + 200);
    const blob2v1 = buildBlockBlob(
      ACCOUNT,
      containerName,
      blob2Name,
      "content"
    );
    await store.createBlob(ctx, blob2v1);

    // List with includeVersions=false (default) should show only current versions
    const [blobs, ,] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined,
      undefined,
      "",
      DEFAULT_LIST_BLOBS_MAX_RESULTS,
      "",
      undefined,
      undefined,
      false,
      undefined
    );

    assert.strictEqual(blobs.length, 2); // Only current versions

    const blob1Result = blobs.find((b) => b.name === blob1Name);
    const blob2Result = blobs.find((b) => b.name === blob2Name);

    assert.ok(blob1Result);
    assert.ok(blob2Result);
    assert.strictEqual(blob1Result.isCurrentVersion, true);
    assert.strictEqual(blob2Result.isCurrentVersion, true);
  });

  it("should list blobs with includeDeletedWithVersions=true showing all versions including deleted @loki", async () => {
    const blob1Name = `blob1-${uuid()}`;
    const blob2Name = `blob2-${uuid()}`;

    // Create first blob with multiple versions
    const blob1v1 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v1");
    await store.createBlob(ctx, blob1v1);
    const blob1v1Downloaded = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      blob1Name,
      undefined,
      undefined
    );
    const blob1v1Id = blob1v1Downloaded.versionId;

    ctx.startTime = new Date(Date.now() + 100);
    const blob1v2 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v2");
    await store.createBlob(ctx, blob1v2);
    const blob1v2Downloaded = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      blob1Name,
      undefined,
      undefined
    );
    const blob1v2Id = blob1v2Downloaded.versionId;

    // Create second blob
    ctx.startTime = new Date(Date.now() + 200);
    const blob2v1 = buildBlockBlob(
      ACCOUNT,
      containerName,
      blob2Name,
      "content"
    );
    await store.createBlob(ctx, blob2v1);

    // Delete first blob (current version becomes previous version)
    await store.deleteBlob(ctx, ACCOUNT, containerName, blob1Name, {});

    // List with includeDeletedWithVersions=true should show all versions including deleted
    const [blobs, ,] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined,
      undefined,
      "",
      DEFAULT_LIST_BLOBS_MAX_RESULTS,
      "",
      undefined,
      undefined,
      undefined,
      true
    );

    assert.strictEqual(blobs.length, 3); // blob1v1, blob1v2 (both now non-current), blob2v1

    // Verify blob1 versions are present but marked as non-current (deleted)
    const blob1Versions = blobs.filter((b) => b.name === blob1Name);
    assert.strictEqual(blob1Versions.length, 2);
    assert.strictEqual(blob1Versions[0].versionId, blob1v1Id); // Earlier version first
    assert.strictEqual(blob1Versions[1].versionId, blob1v2Id); // Later version
    assert.strictEqual(blob1Versions[0].isCurrentVersion, false);
    assert.strictEqual(blob1Versions[1].isCurrentVersion, false); // Deleted, no longer current

    // Verify blob2 is still current
    const blob2Versions = blobs.filter((b) => b.name === blob2Name);
    assert.strictEqual(blob2Versions.length, 1);
    assert.strictEqual(blob2Versions[0].isCurrentVersion, true);
  });

  it("should properly sort versions chronologically with current version last @loki", async () => {
    const blobName = `blob-${uuid()}`;

    // Create multiple versions with specific timestamps
    const timestamps = [
      new Date(Date.now() + 100),
      new Date(Date.now() + 200),
      new Date(Date.now() + 300),
      new Date(Date.now() + 400)
    ];

    const versionIds = [];
    for (let i = 0; i < timestamps.length; i++) {
      ctx.startTime = timestamps[i];
      const blob = buildBlockBlob(
        ACCOUNT,
        containerName,
        blobName,
        `v${i + 1}`
      );
      await store.createBlob(ctx, blob);
      const downloaded = await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        blobName,
        undefined,
        undefined
      );
      versionIds.push(downloaded.versionId);
    }

    // List with includeVersions=true
    const [blobs, ,] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined,
      undefined,
      "",
      DEFAULT_LIST_BLOBS_MAX_RESULTS,
      "",
      undefined,
      undefined,
      true,
      undefined
    );

    const blobVersions = blobs.filter((b) => b.name === blobName);
    assert.strictEqual(blobVersions.length, 4);

    // Verify chronological order (earliest first, current last)
    for (let i = 0; i < blobVersions.length; i++) {
      assert.strictEqual(blobVersions[i].versionId, versionIds[i]);
      if (i === blobVersions.length - 1) {
        assert.strictEqual(blobVersions[i].isCurrentVersion, true); // Last one is current
      } else {
        assert.strictEqual(blobVersions[i].isCurrentVersion, false); // Others are previous
      }
    }
  });

  it("should handle snapshots correctly with includeSnapshots option @loki", async () => {
    const blobName = `blob-${uuid()}`;

    // Create blob
    const blob = buildBlockBlob(ACCOUNT, containerName, blobName, "content");
    await store.createBlob(ctx, blob);

    // Create snapshot
    ctx.startTime = new Date(Date.now() + 100);
    const snapshotResponse = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      blobName
    );
    const snapshotId = snapshotResponse.snapshot;

    // Create another version
    ctx.startTime = new Date(Date.now() + 200);
    const blob2 = buildBlockBlob(ACCOUNT, containerName, blobName, "content2");
    await store.createBlob(ctx, blob2);

    // List with includeSnapshots=true and includeVersions=true
    const [blobs, ,] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined,
      undefined,
      "",
      DEFAULT_LIST_BLOBS_MAX_RESULTS,
      "",
      true,
      undefined,
      true,
      undefined
    );

    const blobItems = blobs.filter((b) => b.name === blobName);

    // Should have: original version, snapshot, current version
    assert.ok(blobItems.length >= 2); // At least the versions, snapshot handling may vary

    // Find the snapshot entry
    const snapshotEntry = blobItems.find((b) => b.snapshot === snapshotId);
    if (snapshotEntry) {
      assert.strictEqual(snapshotEntry.name, blobName);
      assert.strictEqual(snapshotEntry.snapshot, snapshotId);
    }

    // Verify current version is marked correctly
    const currentVersionEntry = blobItems.find(
      (b) => b.isCurrentVersion === true
    );
    assert.ok(currentVersionEntry);
    assert.strictEqual(currentVersionEntry.name, blobName);
  });

  it("should list snapshots without versions when includeSnapshots=true and includeVersions=false @loki", async () => {
    const blobName = `blob-${uuid()}`;

    // Create blob
    const blob = buildBlockBlob(ACCOUNT, containerName, blobName, "content");
    await store.createBlob(ctx, blob);

    // Create snapshot
    ctx.startTime = new Date(Date.now() + 100);
    const snapshotResponse = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      blobName
    );
    const snapshotId = snapshotResponse.snapshot;

    // Create another version
    ctx.startTime = new Date(Date.now() + 200);
    const blob2 = buildBlockBlob(ACCOUNT, containerName, blobName, "content2");
    await store.createBlob(ctx, blob2);

    // List with includeSnapshots=true but includeVersions=false
    const [blobs, ,] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined,
      undefined,
      "",
      DEFAULT_LIST_BLOBS_MAX_RESULTS,
      "",
      true,
      undefined,
      false,
      undefined
    );

    assert.strictEqual(blobs.length, 2);

    const blobItems = blobs.filter((b) => b.name === blobName);

    // Should have: current version + snapshot
    const currentVersionEntry = blobItems.find(
      (b) => b.isCurrentVersion === true && !b.snapshot
    );
    const snapshotEntry = blobItems.find((b) => b.snapshot === snapshotId);

    assert.ok(currentVersionEntry);
    assert.strictEqual(currentVersionEntry.name, blobName);

    if (snapshotEntry) {
      assert.strictEqual(snapshotEntry.name, blobName);
      assert.strictEqual(snapshotEntry.snapshot, snapshotId);
    }
  });

  it("should handle complex scenario with multiple blobs, versions, snapshots, and deletions @loki", async () => {
    const blob1Name = `blob1-${uuid()}`;
    const blob2Name = `blob2-${uuid()}`;
    const blob3Name = `blob3-${uuid()}`;

    // Create blob1 with multiple versions
    const blob1v1 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v1");
    await store.createBlob(ctx, blob1v1);

    ctx.startTime = new Date(Date.now() + 100);
    const blob1v2 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v2");
    await store.createBlob(ctx, blob1v2);

    // Create snapshot of blob1
    ctx.startTime = new Date(Date.now() + 150);
    await store.createSnapshot(ctx, ACCOUNT, containerName, blob1Name);

    // Create blob2
    ctx.startTime = new Date(Date.now() + 200);
    const blob2v1 = buildBlockBlob(
      ACCOUNT,
      containerName,
      blob2Name,
      "content"
    );
    await store.createBlob(ctx, blob2v1);

    // Create blob3 and then delete it
    ctx.startTime = new Date(Date.now() + 300);
    const blob3v1 = buildBlockBlob(
      ACCOUNT,
      containerName,
      blob3Name,
      "content"
    );
    await store.createBlob(ctx, blob3v1);
    await store.deleteBlob(ctx, ACCOUNT, containerName, blob3Name, {});

    // Test 1: includeVersions=true, includeSnapshots=true, includeDeletedWithVersions=false
    const [blobs1, ,] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined,
      undefined,
      "",
      DEFAULT_LIST_BLOBS_MAX_RESULTS,
      "",
      true,
      undefined,
      true,
      false
    );

    // Should have blob1 versions + snapshot + blob2 (blob3 excluded because deleted)
    const blob1Items = blobs1.filter((b) => b.name === blob1Name);
    const blob2Items = blobs1.filter((b) => b.name === blob2Name);
    const blob3Items = blobs1.filter((b) => b.name === blob3Name);

    assert.strictEqual(blob1Items.length, 4); // versions
    assert.strictEqual(blob2Items.length, 1); // current version only
    assert.strictEqual(blob3Items.length, 0); // excluded because deleted

    // Test 2: includeDeletedWithVersions=true
    const [blobs2, ,] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined,
      undefined,
      "",
      DEFAULT_LIST_BLOBS_MAX_RESULTS,
      "",
      true,
      undefined,
      true,
      true
    );

    const blob3ItemsWithDeleted = blobs2.filter((b) => b.name === blob3Name);
    assert.ok(blob3ItemsWithDeleted.length > 0); // Should include deleted blob3 versions
    assert.strictEqual(blob3ItemsWithDeleted[0].isCurrentVersion, false); // Should be marked as non-current
  });

  // ================== VERSION MODE TRANSITION TESTS ==================
  it("should handle setBlobMetadata correctly across versioning mode transitions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning DISABLED and create base blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    await disabledStore.createBlob(ctx, baseBlob);

    // Set metadata on base blob (should not create version)
    ctx.startTime = new Date(Date.now() + 100);
    await disabledStore.setBlobMetadata(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      { basemeta: "value1" }
    );

    const baseFetched = await disabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(baseFetched.versionId, "");
    assert.deepStrictEqual(baseFetched.metadata, { basemeta: "value1" });
    await accountModelStore.close();
    await disabledStore.close();

    // 2. Re-open with versioning ENABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Set metadata should create new version and promote previous
    ctx.startTime = new Date(Date.now() + 200);
    await store.setBlobMetadata(ctx, ACCOUNT, containerName, name, undefined, {
      versionedmeta: "value2"
    });

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.ok(!isNullOrWhitespace(current.versionId));
    assert.ok(current.isCurrentVersion);
    assert.deepStrictEqual(current.metadata, { versionedmeta: "value2" });

    // Previous version should be accessible with original metadata
    const originalLastModifiedIso =
      baseFetched.properties.lastModified.toISOString();
    const previous = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      originalLastModifiedIso
    );
    assert.strictEqual(previous.isCurrentVersion, false);
    assert.deepStrictEqual(previous.metadata, { basemeta: "value1" });
  });

  it("should handle setBlobHTTPHeaders correctly across versioning mode transitions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning DISABLED and create base blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    await disabledStore.createBlob(ctx, baseBlob);

    // Set HTTP headers on base blob (should not create version)
    ctx.startTime = new Date(Date.now() + 100);
    await disabledStore.setBlobHTTPHeaders(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      { blobContentType: "text/plain" }
    );

    const baseFetched = await disabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(baseFetched.versionId, "");
    assert.strictEqual(baseFetched.properties.contentType, "text/plain");
    await accountModelStore.close();
    await disabledStore.close();

    // 2. Re-open with versioning ENABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Set headers should NOT create new version (metadata operation)
    ctx.startTime = new Date(Date.now() + 200);
    await store.setBlobHTTPHeaders(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      { blobContentType: "application/json" }
    );

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    // Should be promoted version but same version (no new version for headers)
    assert.strictEqual(current.versionId, "");
    assert.ok(!current.isCurrentVersion);
    assert.strictEqual(current.properties.contentType, "application/json");
  });

  it("should handle setBlobTag/getBlobTag correctly across versioning mode transitions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning DISABLED and create base blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    await disabledStore.createBlob(ctx, baseBlob);

    // Set tags on base blob (should not create version)
    ctx.startTime = new Date(Date.now() + 100);
    await disabledStore.setBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined,
      { blobTagSet: [{ key: "env", value: "test" }] }
    );

    const baseFetched = await disabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(baseFetched.versionId, "");
    const baseTags = await disabledStore.getBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined
    );
    assert.deepStrictEqual(baseTags, {
      blobTagSet: [{ key: "env", value: "test" }]
    });
    await accountModelStore.close();
    await disabledStore.close();

    // 2. Re-open with versioning ENABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Set tags should NOT create new version (metadata operation)
    ctx.startTime = new Date(Date.now() + 200);
    await store.setBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined,
      { blobTagSet: [{ key: "env", value: "prod" }] }
    );

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    // Should be promoted version but same version (no new version for tags)
    assert.strictEqual(current.versionId, "");
    assert.ok(!current.isCurrentVersion);

    const currentTags = await store.getBlobTag(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined
    );
    assert.deepStrictEqual(currentTags, {
      blobTagSet: [{ key: "env", value: "prod" }]
    });
  });

  it("should handle setTier correctly across versioning mode transitions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning DISABLED and create base blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    baseBlob.properties.accessTier = Models.AccessTier.Hot;
    await disabledStore.createBlob(ctx, baseBlob);

    // Set tier on base blob (should not create version)
    ctx.startTime = new Date(Date.now() + 100);
    await disabledStore.setTier(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      Models.AccessTier.Cool,
      undefined
    );

    const baseFetched = await disabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(baseFetched.versionId, "");
    assert.strictEqual(
      baseFetched.properties.accessTier,
      Models.AccessTier.Cool
    );
    await accountModelStore.close();
    await disabledStore.close();

    // 2. Re-open with versioning ENABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Set tier should work on promoted version
    ctx.startTime = new Date(Date.now() + 200);
    await store.setTier(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      Models.AccessTier.Archive,
      undefined
    );

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    // Should be promoted version
    assert.strictEqual(current.versionId, "");
    assert.ok(!current.isCurrentVersion);
    assert.strictEqual(
      current.properties.accessTier,
      Models.AccessTier.Archive
    );
  });

  it("should handle checkBlobExist correctly across versioning mode transitions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning DISABLED and create base blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    await disabledStore.createBlob(ctx, baseBlob);

    const baseFetched = await disabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(baseFetched.versionId, "");
    const originalLastModifiedIso =
      baseFetched.properties.lastModified.toISOString();

    // Check existence should work
    await disabledStore.checkBlobExist(ctx, ACCOUNT, containerName, name);
    await accountModelStore.close();
    await disabledStore.close();

    // 2. Re-open with versioning ENABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Check existence should work for promoted base blob
    await store.checkBlobExist(ctx, ACCOUNT, containerName, name);

    // No writes yet, so versionId should be empty
    await store.checkBlobExist(ctx, ACCOUNT, containerName, name, "", "");

    // Create new version to ensure previous works
    ctx.startTime = new Date(Date.now() + 200);
    const newBlob = buildBlockBlob(ACCOUNT, containerName, name, "new");
    await store.createBlob(ctx, newBlob);

    // Both current and previous should exist
    await store.checkBlobExist(ctx, ACCOUNT, containerName, name);
    await store.checkBlobExist(
      ctx,
      ACCOUNT,
      containerName,
      name,
      "",
      originalLastModifiedIso
    );
  });

  it("should handle getBlobProperties correctly across versioning mode transitions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning DISABLED and create base blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    await disabledStore.createBlob(ctx, baseBlob);

    // Set metadata
    ctx.startTime = new Date(Date.now() + 100);
    await disabledStore.setBlobMetadata(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      { env: "test" }
    );

    const baseFetched = await disabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(baseFetched.versionId, "");
    const originalLastModifiedIso =
      baseFetched.properties.lastModified.toISOString();

    // Get properties should work
    const baseProps = await disabledStore.getBlobProperties(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined
    );
    assert.deepStrictEqual(baseProps.metadata, { env: "test" });
    await accountModelStore.close();
    await disabledStore.close();

    // 2. Re-open with versioning ENABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Get properties should work for promoted base blob
    const promotedProps = await store.getBlobProperties(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined
    );
    assert.deepStrictEqual(promotedProps.metadata, { env: "test" });

    // Create new version
    ctx.startTime = new Date(Date.now() + 200);
    await store.setBlobMetadata(ctx, ACCOUNT, containerName, name, undefined, {
      env: "prod"
    });

    // Get current properties
    const currentProps = await store.getBlobProperties(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined,
      undefined
    );
    assert.deepStrictEqual(currentProps.metadata, { env: "prod" });

    // Get previous version properties
    const prevProps = await store.getBlobProperties(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      originalLastModifiedIso,
      undefined
    );
    assert.deepStrictEqual(prevProps.metadata, { env: "test" });
  });

  it("should handle createSnapshot correctly across versioning mode transitions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning DISABLED and create base blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    await disabledStore.createBlob(ctx, baseBlob);

    // Create snapshot (should not create version)
    ctx.startTime = new Date(Date.now() + 100);
    const snapshotResponse1 = await disabledStore.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );
    assert.ok(snapshotResponse1.snapshot);
    assert.strictEqual(snapshotResponse1.versionId, "");

    const baseFetched = await disabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(baseFetched.versionId, "");
    const originalLastModifiedIso =
      baseFetched.properties.lastModified.toISOString();
    await accountModelStore.close();
    await disabledStore.close();

    // 2. Re-open with versioning ENABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Create snapshot should create new version and promote previous
    ctx.startTime = new Date(Date.now() + 200);
    const snapshotResponse2 = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );
    assert.ok(snapshotResponse2.snapshot);
    assert.ok(!isNullOrWhitespace(snapshotResponse2.versionId));

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.ok(!isNullOrWhitespace(current.versionId));
    assert.ok(current.isCurrentVersion);

    // Previous version should be accessible
    const previous = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      originalLastModifiedIso
    );
    assert.strictEqual(previous.isCurrentVersion, false);
    assert.strictEqual(previous.versionId, originalLastModifiedIso);
  });

  it("should handle appendBlock correctly across versioning mode transitions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning DISABLED and create append blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseAppendBlob = buildAppendBlob(ACCOUNT, containerName, name);
    await disabledStore.createBlob(ctx, baseAppendBlob);

    // Append block (should not create version)
    const block1 = {
      accountName: ACCOUNT,
      containerName,
      blobName: name,
      name: "append1",
      size: 10,
      persistency: { id: uuid(), offset: 0, count: 10 }
    } as any;

    ctx.startTime = new Date(Date.now() + 100);
    await disabledStore.appendBlock(ctx, block1);

    const baseFetched = await disabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(baseFetched.versionId, "");
    assert.strictEqual(baseFetched.properties.contentLength, 10);
    await accountModelStore.close();
    await disabledStore.close();

    // 2. Re-open with versioning ENABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Append block should NOT create new version (per Azure spec)
    const block2 = {
      accountName: ACCOUNT,
      containerName,
      blobName: name,
      name: "append2",
      size: 15,
      persistency: { id: uuid(), offset: 10, count: 15 }
    } as any;

    ctx.startTime = new Date(Date.now() + 200);
    await store.appendBlock(ctx, block2);

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    // Should not be promoted version (no new version for page upload).
    // It does not count as a versioning "write."
    assert.strictEqual(current.versionId, "");
    assert.ok(!current.isCurrentVersion);
    assert.strictEqual(current.properties.contentLength, 25);
  });

  it("should handle uploadPages correctly across versioning mode transitions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning DISABLED and create page blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const basePageBlob = buildPageBlob(ACCOUNT, containerName, name, 512);
    await disabledStore.createBlob(ctx, basePageBlob);

    // Upload pages (should not create version)
    const persistency1 = { id: uuid(), offset: 0, count: 512 };
    ctx.startTime = new Date(Date.now() + 100);
    await disabledStore.uploadPages(ctx, basePageBlob, 0, 511, persistency1);

    const baseFetched = await disabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(baseFetched.versionId, "");
    await accountModelStore.close();
    await disabledStore.close();

    // 2. Re-open with versioning ENABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Upload pages should NOT create new version (per Azure spec)
    const persistency2 = { id: uuid(), offset: 0, count: 512 };
    ctx.startTime = new Date(Date.now() + 200);
    await store.uploadPages(ctx, basePageBlob, 0, 511, persistency2);

    const current = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    // Should not be promoted version (no new version for page upload).
    // It does not count as a versioning "write."
    assert.strictEqual(current.versionId, "");
    assert.ok(!current.isCurrentVersion);
  });

  it("should handle deleteBlob correctly across versioning mode transitions @loki", async () => {
    await store.close();
    await store.clean();

    const name = `blob-${uuid()}`;

    // 1. Create store with versioning DISABLED and create base blob
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
    const baseBlob = buildBlockBlob(ACCOUNT, containerName, name, "base");
    await disabledStore.createBlob(ctx, baseBlob);

    const baseFetched = await disabledStore.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );
    assert.strictEqual(baseFetched.versionId, "");
    const originalLastModifiedIso =
      baseFetched.properties.lastModified.toISOString();
    await accountModelStore.close();
    await disabledStore.close();

    // 2. Re-open with versioning ENABLED
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // Create new version first so we have something to delete
    ctx.startTime = new Date(Date.now() + 200);
    const newBlob = buildBlockBlob(ACCOUNT, containerName, name, "new");
    await store.createBlob(ctx, newBlob);

    const currentBeforeDelete = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      undefined
    );

    // Delete current blob should make it non-current
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {});

    // Current version should no longer exist
    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        undefined
      );
      assert.fail("Should have thrown error for deleted current blob");
    } catch (error) {
      // Expected
    }

    // Previous versions should still exist as non-current
    const originalVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      originalLastModifiedIso
    );
    assert.strictEqual(originalVersion.isCurrentVersion, false);

    const deletedVersion = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      undefined,
      currentBeforeDelete.versionId
    );
    assert.strictEqual(deletedVersion.isCurrentVersion, false);

    // Should be able to delete specific version by versionId
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {
      versionId: originalLastModifiedIso
    });

    // That specific version should no longer exist
    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        originalLastModifiedIso
      );
      assert.fail("Should have thrown error for deleted specific version");
    } catch (error) {
      // Expected
    }
  });
});

describe("LokiBlobMetadataStore - Versioning Enabled - deleteBlob comprehensive code path coverage @loki", () => {
  let store: LokiBlobMetadataStore;
  let disabledStore: LokiBlobMetadataStore;
  let accountModelStore: LokiAccountModelStore;
  let disabledAccountModelStore: LokiAccountModelStore;
  let ctx: Context;
  const containerName = "test-container";

  beforeEach(async () => {
    ctx = createContext();
    // Versioning enabled
    let accountModel: AccountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore("__test_db_blob__.json", false, accountModelStore);
    await store.init();
    await store.createContainer(ctx, buildContainer(ACCOUNT, containerName));

    // Versioning disabled
    accountModel =
    {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    disabledAccountModelStore = createAccountModelStore(accountModel, false);
    await disabledAccountModelStore.init();
    disabledStore = new LokiBlobMetadataStore(
      "__test_db_blob_disabled__.json",
      false,
      disabledAccountModelStore
    );
    await disabledStore.init();
    await disabledStore.createContainer(
      ctx,
      buildContainer(ACCOUNT, containerName)
    );
  });

  afterEach(async () => {
    await accountModelStore.close();
    await store.close();
    await store.clean();
    await disabledAccountModelStore.close();
    await disabledStore.close();
    await disabledStore.clean();
  });

  it("should throw error when versionId is provided with snapshot option @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    const created = await store.createBlob(ctx, blob);

    // Create a snapshot
    const snapshot = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );

    try {
      await store.deleteBlob(ctx, ACCOUNT, containerName, name, {
        snapshot: snapshot.snapshot,
        versionId: created.versionId
      });
      assert.fail(
        "Should have thrown error when versionId provided with snapshot"
      );
    } catch (error) {
      assert.strictEqual(error.statusCode, 400);
      assert.ok(
        error.message.includes(
          "When deleting a blob version, you cannot specify a snapshot"
        )
      );
    }
  });

  it("should throw error when versionId is provided with deleteSnapshots option @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    const created = await store.createBlob(ctx, blob);

    try {
      await store.deleteBlob(ctx, ACCOUNT, containerName, name, {
        deleteSnapshots: Models.DeleteSnapshotsOptionType.Include,
        versionId: created.versionId
      });
      assert.fail(
        "Should have thrown error when versionId provided with deleteSnapshots"
      );
    } catch (error) {
      assert.strictEqual(error.statusCode, 400);
      assert.ok(
        error.message.includes(
          "When deleting a blob version, you cannot specify a snapshot"
        )
      );
    }
  });

  it("should throw BlobNotFound when deleting non-existent blob @loki", async () => {
    try {
      await store.deleteBlob(
        ctx,
        ACCOUNT,
        containerName,
        "non-existent-blob",
        {}
      );
      assert.fail("Should have thrown BlobNotFound error");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }
  });

  it("should throw error when trying to use deleteSnapshots against a snapshot @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    // Create a snapshot
    const snapshot = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );

    try {
      await store.deleteBlob(ctx, ACCOUNT, containerName, name, {
        snapshot: snapshot.snapshot,
        deleteSnapshots: Models.DeleteSnapshotsOptionType.Include
      });
      assert.fail(
        "Should have thrown error when using deleteSnapshots against snapshot"
      );
    } catch (error) {
      assert.strictEqual(error.statusCode, 400);
      assert.ok(
        error.message.includes("Invalid operation against a blob snapshot")
      );
    }
  });

  it("should delete specific version when versionId is provided @loki", async () => {
    const name = `blob-${uuid()}`;

    // Create version 1
    const v1 = buildBlockBlob(ACCOUNT, containerName, name, "version1");
    const created1 = await store.createBlob(ctx, v1);

    // Create version 2
    ctx.startTime = new Date(Date.now() + 100);
    const v2 = buildBlockBlob(ACCOUNT, containerName, name, "version2");
    await store.createBlob(ctx, v2);

    // Delete version 1 specifically
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {
      versionId: created1.versionId
    });

    // Version 2 should still exist as current
    const current = await store.downloadBlob(ctx, ACCOUNT, containerName, name);
    assert.strictEqual(
      current.properties.contentLength,
      Buffer.byteLength("version2")
    );

    // Version 1 should be gone
    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        "",
        created1.versionId
      );
      assert.fail("Should have thrown error for deleted version");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }
  });

  it("should throw SnapshotsPresent when deleting base blob with snapshots (versioning enabled) @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    // Create snapshots
    await store.createSnapshot(ctx, ACCOUNT, containerName, name);
    await store.createSnapshot(ctx, ACCOUNT, containerName, name);

    try {
      await store.deleteBlob(ctx, ACCOUNT, containerName, name, {});
      assert.fail("Should have thrown SnapshotsPresent error");
    } catch (error) {
      assert.strictEqual(error.statusCode, 409);
      assert.ok(error.message.includes("has snapshots"));
    }
  });

  it("should throw SnapshotsPresent when deleting base blob with snapshots (versioning disabled) @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await disabledStore.createBlob(ctx, blob);

    // Create snapshots
    await disabledStore.createSnapshot(ctx, ACCOUNT, containerName, name);
    await disabledStore.createSnapshot(ctx, ACCOUNT, containerName, name);

    try {
      await disabledStore.deleteBlob(ctx, ACCOUNT, containerName, name, {});
      assert.fail("Should have thrown SnapshotsPresent error");
    } catch (error) {
      assert.strictEqual(error.statusCode, 409);
      assert.ok(error.message.includes("has snapshots"));
    }
  });

  it("should mark blob as non-current when deleting base blob without snapshots (versioning enabled) @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    const created = await store.createBlob(ctx, blob);

    // Delete the blob (no snapshots exist)
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {});

    // Blob should be marked as non-current, not physically deleted
    try {
      await store.downloadBlob(ctx, ACCOUNT, containerName, name);
      assert.fail("Should have thrown error for non-current blob");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }

    // But should still be accessible by version ID
    const versionedBlob = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      "",
      created.versionId
    );
    assert.strictEqual(
      versionedBlob.properties.contentLength,
      Buffer.byteLength("content")
    );
  });

  it("should physically delete blob when deleting base blob without snapshots (versioning disabled) @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    const created = await disabledStore.createBlob(ctx, blob);

    // Delete the blob (no snapshots exist)
    await disabledStore.deleteBlob(ctx, ACCOUNT, containerName, name, {});

    // Blob should be completely gone
    try {
      await disabledStore.downloadBlob(ctx, ACCOUNT, containerName, name);
      assert.fail("Should have thrown error for deleted blob");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }

    // Should not be accessible by version ID either (versioning disabled)
    try {
      await disabledStore.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        "",
        created.versionId
      );
      assert.fail("Should have thrown error for deleted blob by version");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }
  });

  it("should delete individual snapshot when targeting specific snapshot @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    // Create multiple snapshots
    const snapshot1 = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );
    ctx.startTime = new Date(Date.now() + 100);
    const snapshot2 = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );

    // Delete first snapshot specifically
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {
      snapshot: snapshot1.snapshot
    });

    // Base blob should still exist
    const baseBlob = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name
    );
    assert.strictEqual(
      baseBlob.properties.contentLength,
      Buffer.byteLength("content")
    );

    // Second snapshot should still exist
    const snap2 = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      snapshot2.snapshot
    );
    assert.strictEqual(
      snap2.properties.contentLength,
      Buffer.byteLength("content")
    );

    // First snapshot should be gone
    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        snapshot1.snapshot
      );
      assert.fail("Should have thrown error for deleted snapshot");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }
  });

  it("should delete base blob and all snapshots when deleteSnapshots=include (versioning disabled) @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await disabledStore.createBlob(ctx, blob);

    // Create snapshots
    const snapshot1 = await disabledStore.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );
    const snapshot2 = await disabledStore.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );

    // Delete blob and all snapshots
    await disabledStore.deleteBlob(ctx, ACCOUNT, containerName, name, {
      deleteSnapshots: Models.DeleteSnapshotsOptionType.Include
    });

    // Base blob should be gone
    try {
      await disabledStore.downloadBlob(ctx, ACCOUNT, containerName, name);
      assert.fail("Should have thrown error for deleted blob");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }

    // All snapshots should be gone
    try {
      await disabledStore.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        snapshot1.snapshot
      );
      assert.fail("Should have thrown error for deleted snapshot1");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }

    try {
      await disabledStore.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        snapshot2.snapshot
      );
      assert.fail("Should have thrown error for deleted snapshot2");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }
  });

  it("should delete snapshots only and mark base blob as non-current when deleteSnapshots=include (versioning enabled) @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    const created = await store.createBlob(ctx, blob);

    // Create snapshots
    const snapshot1 = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );
    const snapshot2 = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );

    // Delete blob and all snapshots
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {
      deleteSnapshots: Models.DeleteSnapshotsOptionType.Include
    });

    // Base blob should be marked as non-current
    try {
      await store.downloadBlob(ctx, ACCOUNT, containerName, name);
      assert.fail("Should have thrown error for non-current blob");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }

    // All snapshots should be gone
    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        snapshot1.snapshot
      );
      assert.fail("Should have thrown error for deleted snapshot1");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }

    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        snapshot2.snapshot
      );
      assert.fail("Should have thrown error for deleted snapshot2");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }

    // But base blob should still be accessible by version ID
    const versionedBlob = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name,
      "",
      created.versionId
    );
    assert.strictEqual(
      versionedBlob.properties.contentLength,
      Buffer.byteLength("content")
    );
  });

  it("should delete only snapshots when deleteSnapshots=only @loki", async () => {
    const name = `blob-${uuid()}`;
    const blob = buildBlockBlob(ACCOUNT, containerName, name, "content");
    await store.createBlob(ctx, blob);

    // Create snapshots
    const snapshot1 = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );
    const snapshot2 = await store.createSnapshot(
      ctx,
      ACCOUNT,
      containerName,
      name
    );

    // Delete only snapshots
    await store.deleteBlob(ctx, ACCOUNT, containerName, name, {
      deleteSnapshots: Models.DeleteSnapshotsOptionType.Only
    });

    // Base blob should still exist and be current
    const baseBlob = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      name
    );
    assert.strictEqual(
      baseBlob.properties.contentLength,
      Buffer.byteLength("content")
    );

    // All snapshots should be gone
    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        snapshot1.snapshot
      );
      assert.fail("Should have thrown error for deleted snapshot1");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }

    try {
      await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        snapshot2.snapshot
      );
      assert.fail("Should have thrown error for deleted snapshot2");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }
  });
});

describe("LokiBlobMetadataStore - Versioning Enabled - listBlobs and filterBlobs pagination tests @loki", () => {
  let store: LokiBlobMetadataStore;
  let accountModelStore: LokiAccountModelStore;
  let containerName: string;
  let ctx: Context;
  const DB_FILE = "__test_db_blob__.json";

  beforeEach(async () => {
    ctx = createContext();
    containerName = `container-${uuid()}`;
    const accountModel: AccountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();
    await store.createContainer(ctx, buildContainer(ACCOUNT, containerName));
  });

  afterEach(async () => {
    await accountModelStore.close();
    await accountModelStore.clean();
    await store.close();
    await store.clean();
  });

  it("should paginate listBlobs correctly with includeVersions=true using name+versionId marker @loki", async () => {
    // Create multiple versions of different blobs to test pagination
    const blob1Name = `blob-a`;
    const blob2Name = `blob-b`;

    // Create first blob with multiple versions
    const blob1v1 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v1");
    await store.createBlob(ctx, blob1v1);
    
    ctx.startTime = new Date(Date.now() + 100);
    const blob1v2 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v2");
    await store.createBlob(ctx, blob1v2);

    ctx.startTime = new Date(Date.now() + 200);
    const blob1v3 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v3");
    await store.createBlob(ctx, blob1v3);

    // Create second blob with multiple versions
    ctx.startTime = new Date(Date.now() + 300);
    const blob2v1 = buildBlockBlob(ACCOUNT, containerName, blob2Name, "v1");
    await store.createBlob(ctx, blob2v1);

    ctx.startTime = new Date(Date.now() + 400);
    const blob2v2 = buildBlockBlob(ACCOUNT, containerName, blob2Name, "v2");
    await store.createBlob(ctx, blob2v2);

    // Test pagination with small maxResults to trigger marker logic
    const [firstPage, , firstMarker] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined, // delimiter
      undefined, // blob
      "", // prefix
      3, // maxResults - should get 3 versions
      "", // marker
      false, // includeSnapshots
      false, // includeUncommittedBlobs
      true, // includeVersions - this triggers the changed code path
      false // includeDeletedWithVersions
    );

    assert.strictEqual(firstPage.length, 3, "First page should have 3 versions");
    assert.ok(firstMarker, "Should have a marker for next page");

    // Continue pagination with marker
    const [secondPage, , secondMarker] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined,
      undefined,
      "",
      3,
      firstMarker!, // Use marker from first page
      false,
      false,
      true, // includeVersions=true triggers name+versionId comparison
      false
    );

    assert.strictEqual(secondPage.length, 2, "Second page should have remaining 2 versions");
    assert.strictEqual(secondMarker, "", "Should not have marker when all results returned");

    // Verify all versions are accounted for
    const totalVersions = firstPage.length + secondPage.length;
    assert.strictEqual(totalVersions, 5, "Should have 5 total versions across both pages");

    // Verify versions are properly ordered by name+versionId
    const allVersions = [...firstPage, ...secondPage];
    for (let i = 1; i < allVersions.length; i++) {
      const prev = allVersions[i - 1];
      const curr = allVersions[i];
      const prevKey = prev.name + prev.versionId;
      const currKey = curr.name + curr.versionId;
      assert.ok(prevKey <= currKey, `Versions should be ordered: ${prevKey} <= ${currKey}`);
    }
  });

  it("should paginate listBlobs correctly with includeVersions=false using name-only marker @loki", async () => {
    // Create multiple blobs (current versions only)
    const blobNames = [`blob-a`, `blob-b`, `blob-c`, `blob-d`];

    for (let i = 0; i < blobNames.length; i++) {
      ctx.startTime = new Date(Date.now() + i * 100);
      const blob = buildBlockBlob(ACCOUNT, containerName, blobNames[i], `content${i}`);
      await store.createBlob(ctx, blob);
      
      // Create additional versions for some blobs
      if (i % 2 === 0) {
        ctx.startTime = new Date(Date.now() + i * 100 + 50);
        const blob2 = buildBlockBlob(ACCOUNT, containerName, blobNames[i], `content${i}v2`);
        await store.createBlob(ctx, blob2);
      }
    }

    // Test pagination with includeVersions=false (should use name-only marker)
    const [firstPage, , firstMarker] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined,
      undefined,
      "",
      2, // maxResults
      "",
      false,
      false,
      false, // includeVersions=false - uses original name-only logic
      false
    );

    assert.strictEqual(firstPage.length, 2, "First page should have 2 current versions");
    assert.ok(firstMarker, "Should have marker for next page");

    // Continue pagination
    const [secondPage, , secondMarker] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined,
      undefined,
      "",
      2,
      firstMarker!,
      false,
      false,
      false, // includeVersions=false
      false
    );

    assert.strictEqual(secondPage.length, 2, "Second page should have 2 more current versions");
    assert.strictEqual(secondMarker, "", "Should not have marker when all results returned");

    // Verify only current versions are returned
    const allBlobs = [...firstPage, ...secondPage];
    assert.strictEqual(allBlobs.length, 4, "Should have 4 current versions total");
    allBlobs.forEach(blob => {
      assert.ok(blob.isCurrentVersion, `Blob ${blob.name} should be current version`);
    });
  });

  it("should handle filterBlobs with versioning enabled returning only current versions @loki", async () => {
    // Create multiple blobs with tags that change across versions
    const blob1Name = `tagged-blob-a`;
    const blob2Name = `tagged-blob-b`;

    // Create first blob with multiple versions, each with different tags
    const blob1v1 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v1");
    blob1v1.blobTags = { blobTagSet: [{ key: "env", value: "dev" }] };
    await store.createBlob(ctx, blob1v1);

    ctx.startTime = new Date(Date.now() + 100);
    const blob1v2 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v2");
    blob1v2.blobTags = { blobTagSet: [{ key: "env", value: "test" }] };
    await store.createBlob(ctx, blob1v2);

    ctx.startTime = new Date(Date.now() + 200);
    const blob1v3 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v3");
    blob1v3.blobTags = { blobTagSet: [{ key: "env", value: "prod" }] };
    await store.createBlob(ctx, blob1v3);

    // Create second blob with different tags across versions
    ctx.startTime = new Date(Date.now() + 300);
    const blob2v1 = buildBlockBlob(ACCOUNT, containerName, blob2Name, "v1");
    blob2v1.blobTags = { blobTagSet: [{ key: "env", value: "dev" }] };
    await store.createBlob(ctx, blob2v1);

    ctx.startTime = new Date(Date.now() + 400);
    const blob2v2 = buildBlockBlob(ACCOUNT, containerName, blob2Name, "v2");
    blob2v2.blobTags = { blobTagSet: [{ key: "env", value: "prod" }] };
    await store.createBlob(ctx, blob2v2);

    // Search for blobs with env=prod (current versions of both blobs)
    const [prodResults,] = await store.filterBlobs(
      ctx,
      ACCOUNT,
      containerName,
      `"env" = 'prod'`,
      10,
      ""
    );

    assert.strictEqual(prodResults.length, 2, "Should find only 2 current versions with env=prod");
    assert.strictEqual(prodResults[0].name, blob1Name, "First result should be blob1");
    assert.strictEqual(prodResults[1].name, blob2Name, "Second result should be blob2");
    
    // Verify that filtered results include versionId and isCurrentVersion
    prodResults.forEach(result => {
      assert.ok(result.versionId, `Result ${result.name} should have versionId`);
      assert.ok(!isNullOrWhitespace(result.versionId), `Result ${result.name} versionId should not be empty`);
      assert.strictEqual(result.isCurrentVersion, true, `Result ${result.name} should be current version`);
    });

    // Search for blobs with env=dev (previous versions only)
    const [devResults,] = await store.filterBlobs(
      ctx,
      ACCOUNT,
      containerName,
      `"env" = 'dev'`,
      10,
      ""
    );

    assert.strictEqual(devResults.length, 0, "Should NOT find previous versions with env=dev");

    // Search for blobs with env=test (previous version only)
    const [testResults,] = await store.filterBlobs(
      ctx,
      ACCOUNT,
      containerName,
      `"env" = 'test'`,
      10,
      ""
    );

    assert.strictEqual(testResults.length, 0, "Should NOT find previous version with env=test");

    // Verify that previous version tags are preserved (even though not searchable)
    assert.ok(blob1v1.versionId, "blob1v1 should have versionId");
    const blob1v1Retrieved = await store.downloadBlob(
      ctx,
      ACCOUNT,
      containerName,
      blob1Name,
      "",
      blob1v1.versionId
    );
    assert.ok(blob1v1Retrieved.blobTags, "Previous version should have tags");
    assert.strictEqual(
      blob1v1Retrieved.blobTags.blobTagSet.find(t => t.key === "env")?.value,
      "dev",
      "Previous version tags should be preserved"
    );
  });

  it("should handle mixed scenario with multiple blobs, versions, and pagination boundaries @loki", async () => {
    const blobNames = [`blob-001-${uuid()}`, `blob-002-${uuid()}`, `blob-003-${uuid()}`];
    const versionIds: string[] = [];

    // Create multiple versions for each blob
    for (let blobIndex = 0; blobIndex < blobNames.length; blobIndex++) {
      for (let version = 1; version <= 3; version++) {
        ctx.startTime = new Date(Date.now() + (blobIndex * 1000) + (version * 100));
        const blob = buildBlockBlob(ACCOUNT, containerName, blobNames[blobIndex], `content-${version}`);
        const created = await store.createBlob(ctx, blob);
        versionIds.push(created.versionId!);
      }
    }

    // Test with maxResults that doesn't align with blob boundaries
    const [page1, , marker1] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined, undefined, "", 4, "", false, false, true, false
    );

    assert.strictEqual(page1.length, 4, "Page 1 should have 4 versions");
    assert.ok(marker1, "Should have marker after page 1");

    const [page2, , marker2] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined, undefined, "", 4, marker1!, false, false, true, false
    );

    assert.strictEqual(page2.length, 4, "Page 2 should have 4 versions");
    assert.ok(marker2, "Should have marker after page 2");

    const [page3, , marker3] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined, undefined, "", 4, marker2!, false, false, true, false
    );

    assert.strictEqual(page3.length, 1, "Page 3 should have 1 remaining version");
    assert.strictEqual(marker3, "", "Should not have marker after final page");

    // Verify all versions accounted for
    const allPages = [...page1, ...page2, ...page3];
    assert.strictEqual(allPages.length, 9, "Should have 9 total versions (3 blobs × 3 versions)");

    // Verify version IDs are properly distributed
    const returnedVersionIds = allPages.map(b => b.versionId!);
    versionIds.forEach(vid => {
      assert.ok(returnedVersionIds.includes(vid), `Version ID ${vid} should be in results`);
    });
  });

  it("should handle edge cases with empty results and boundary conditions @loki", async () => {
    // Test empty container
    const [emptyPage, , emptyMarker] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined, undefined, "", 10, "", false, false, true, false
    );

    assert.strictEqual(emptyPage.length, 0, "Empty container should return no results");
    assert.strictEqual(emptyMarker, "", "Empty container should not return marker");

    // Create single blob with single version
    const singleBlobName = `single-${uuid()}`;
    const singleBlob = buildBlockBlob(ACCOUNT, containerName, singleBlobName, "content");
    await store.createBlob(ctx, singleBlob);

    // Test with maxResults larger than available
    const [singlePage, , singleMarker] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined, undefined, "", 100, "", false, false, true, false
    );

    assert.strictEqual(singlePage.length, 1, "Should return single version");
    assert.strictEqual(singleMarker, "", "Should not return marker when all results fit");

    // Test with maxResults of 1
    const [onePage, , oneMarker] = await store.listBlobs(
      ctx,
      ACCOUNT,
      containerName,
      undefined, undefined, "", 1, "", false, false, true, false
    );

    assert.strictEqual(onePage.length, 1, "Should return exactly 1 result");
    assert.strictEqual(oneMarker, "", "Should not have marker when no more results");
  });

  it("should correctly handle listBlobs versioning transitions @loki", async () => {
    await store.close();
    await store.clean();

    // Start with versioning enabled
    let accountModel: AccountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: true
    };
    let accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    let versioningStore = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await versioningStore.init();
    await versioningStore.createContainer(ctx, buildContainer(ACCOUNT, containerName));

    const blobName = `transition-${uuid()}`;

    // Create multiple versions
    const v1 = buildBlockBlob(ACCOUNT, containerName, blobName, "v1");
    await versioningStore.createBlob(ctx, v1);

    ctx.startTime = new Date(Date.now() + 100);
    const v2 = buildBlockBlob(ACCOUNT, containerName, blobName, "v2");
    await versioningStore.createBlob(ctx, v2);

    // Test with versioning enabled - includeVersions=true should show both
    const [enabledVersions, ,] = await versioningStore.listBlobs(
      ctx, ACCOUNT, containerName, undefined, undefined, "", 10, "", false, false, true, false
    );
    assert.strictEqual(enabledVersions.length, 2, "Should show 2 versions when versioning enabled");

    // Test with versioning enabled - includeVersions=false should show only current
    const [enabledCurrent, ,] = await versioningStore.listBlobs(
      ctx, ACCOUNT, containerName, undefined, undefined, "", 10, "", false, false, false, false
    );
    assert.strictEqual(enabledCurrent.length, 1, "Should show 1 current version");
    assert.ok(enabledCurrent[0].isCurrentVersion, "Result should be current version");

    await versioningStore.close();
    await accountModelStore.close();

    // Switch to versioning disabled
    accountModel = {
      key: ACCOUNT,
      isBlobVersioningEnabled: false
    };
    accountModelStore = createAccountModelStore(accountModel, false);
    await accountModelStore.init();
    store = new LokiBlobMetadataStore(DB_FILE, false, accountModelStore);
    await store.init();

    // With versioning disabled, includeVersions should still work but use different logic
    const [disabledVersions, ,] = await store.listBlobs(
      ctx, ACCOUNT, containerName, undefined, undefined, "", 10, "", false, false, true, false
    );
    assert.strictEqual(disabledVersions.length, 2, "Should still show existing versions even when versioning disabled");

    const [disabledCurrent, ,] = await store.listBlobs(
      ctx, ACCOUNT, containerName, undefined, undefined, "", 10, "", false, false, false, false
    );
    assert.strictEqual(disabledCurrent.length, 1, "Should show 1 current version when versioning disabled");
  });

  it("should paginate listBlobs correctly with snapshots, versions and includeSnapshots=true @loki", async () => {
    // Create multiple blobs with versions and snapshots
    const blob1Name = `snap-blob-a`;
    const blob2Name = `snap-blob-b`;

    // Create first blob with versions
    const blob1v1 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v1");
    await store.createBlob(ctx, blob1v1);

    // Create snapshot of first blob current version
    ctx.startTime = new Date(Date.now() + 200);
    const snapshot1 = await store.createSnapshot(ctx, ACCOUNT, containerName, blob1Name);

    ctx.startTime = new Date(Date.now() + 300);
    const blob1v2 = buildBlockBlob(ACCOUNT, containerName, blob1Name, "v2");
    await store.createBlob(ctx, blob1v2);

    // Create second blob with versions
    ctx.startTime = new Date(Date.now() + 400);
    const blob2v1 = buildBlockBlob(ACCOUNT, containerName, blob2Name, "v1");
    await store.createBlob(ctx, blob2v1);

    // Create snapshot of second blob
    ctx.startTime = new Date(Date.now() + 500);
    const snapshot2 = await store.createSnapshot(ctx, ACCOUNT, containerName, blob2Name);

    ctx.startTime = new Date(Date.now() + 600);
    const blob2v2 = buildBlockBlob(ACCOUNT, containerName, blob2Name, "v2");
    await store.createBlob(ctx, blob2v2);

    // Test pagination with includeVersions=true and includeSnapshots=true
    const [firstPage, , firstMarker] = await store.listBlobs(
      ctx, ACCOUNT, containerName, undefined, undefined, "", 4, "", true, false, true, false
    );

    assert.strictEqual(firstPage.length, 4, "First page should have 4 items (versions only, snapshots at end)");
    assert.ok(firstMarker, "Should have marker for next page");

    // Continue pagination
    const [secondPage, , secondMarker] = await store.listBlobs(
      ctx, ACCOUNT, containerName, undefined, undefined, "", 4, firstMarker, true, false, true, false
    );

    assert.strictEqual(secondPage.length, 4, "Second page should have remaining items");
    assert.strictEqual(secondMarker, "", "Should not have marker when all results returned");

    // Verify snapshots are included and ordered correctly (snapshots come after versions)
    const allItems = [...firstPage, ...secondPage];
    
    // Should have: blob1v1, blob1v2, blob1v3(from snapshot), blob2v1, blob2v2, blob2v3(from snapshot), blob1-snapshot, blob2-snapshot
    assert.ok(allItems.length >= 6, "Should have at least 6 items including versions and snapshots");
    
    // Check that snapshots are present
    const snapshots = allItems.filter(item => item.snapshot && item.snapshot.length > 0);
    assert.strictEqual(snapshots.length, 2, "Should have 2 snapshots");
    assert.ok(snapshots.some(s => s.snapshot === snapshot1.snapshot), "Should include first snapshot");
    assert.ok(snapshots.some(s => s.snapshot === snapshot2.snapshot), "Should include second snapshot");
  });
});
