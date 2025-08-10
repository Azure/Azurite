import assert = require("assert");
import { v4 as uuid } from "uuid";
import * as fs from "fs";
import LokiBlobMetadataStore from "../../src/blob/persistence/LokiBlobMetadataStore";
import {
  BlobModel,
  ContainerModel
} from "../../src/blob/persistence/IBlobMetadataStore";
import * as Models from "../../src/blob/generated/artifacts/models";
import Context from "../../src/blob/generated/Context";
import { configLogger } from "../../src/common/Logger";
import { isNullOrWhitespace } from "../../src/blob/utils/utils";
// Silence logs for tests
configLogger(false);

/**
 * Helper to create a minimal Context object.
 */
function createContext(): Context {
  return {
    contextId: uuid(),
    startTime: new Date()
  } as any as Context; // Cast to simplify test construction
}

/**
 * Helper to build a minimal ContainerModel for tests.
 */
function buildContainer(account: string, name: string): ContainerModel {
  const now = new Date();
  return {
    accountName: account,
    name,
    properties: {
      lastModified: now,
      etag: '"test-etag"',
      leaseStatus: Models.LeaseStatusType.Unlocked,
      leaseState: Models.LeaseStateType.Available,
      defaultEncryptionScope: undefined,
      denyEncryptionScopeOverride: undefined,
      hasImmutabilityPolicy: undefined,
      hasLegalHold: undefined,
      publicAccess: undefined,
      leaseDuration: undefined
    }
  } as any as ContainerModel;
}

/**
 * Helper to build a minimal Block Blob BlobModel for tests.
 */
function buildBlockBlob(
  account: string,
  container: string,
  name: string,
  content: string
): BlobModel {
  const now = new Date();
  return {
    accountName: account,
    containerName: container,
    name,
    properties: {
      creationTime: now,
      lastModified: now,
      etag: `\"etag-${uuid()}\"`,
      blobType: Models.BlobType.BlockBlob,
      contentLength: Buffer.byteLength(content),
      serverEncrypted: false,
      accessTier: Models.AccessTier.Hot,
      accessTierInferred: true,
      cacheControl: undefined,
      contentType: undefined,
      contentMD5: undefined,
      contentEncoding: undefined,
      contentLanguage: undefined,
      contentDisposition: undefined,
      leaseDuration: undefined,
      leaseState: Models.LeaseStateType.Available,
      leaseStatus: Models.LeaseStatusType.Unlocked,
      tagCount: undefined,
      archiveStatus: undefined,
      accessTierChangeTime: undefined,
      deletedTime: undefined,
      remainingRetentionDays: undefined,
      deleted: false,
      rehydratePriority: undefined,
      lastAccessedOn: undefined,
      snapshot: undefined
    },
    isCommitted: true,
    committedBlocksInOrder: [],
    // Versioning top-level fields (duplicated when persisted in Loki)
    snapshot: ""
  } as any as BlobModel;
}

/**
 * Helper to build a minimal Page Blob BlobModel for tests.
 */
function buildPageBlob(
  account: string,
  container: string,
  name: string,
  contentLength: number
): BlobModel {
  const now = new Date();
  return {
    accountName: account,
    containerName: container,
    name,
    properties: {
      creationTime: now,
      lastModified: now,
      etag: `\"etag-${uuid()}\"`,
      blobType: Models.BlobType.PageBlob,
      contentLength,
      serverEncrypted: false,
      accessTier: undefined,
      accessTierInferred: undefined,
      cacheControl: undefined,
      contentType: undefined,
      contentMD5: undefined,
      contentEncoding: undefined,
      contentLanguage: undefined,
      contentDisposition: undefined,
      leaseDuration: undefined,
      leaseState: Models.LeaseStateType.Available,
      leaseStatus: Models.LeaseStatusType.Unlocked,
      tagCount: undefined,
      archiveStatus: undefined,
      accessTierChangeTime: undefined,
      deletedTime: undefined,
      remainingRetentionDays: undefined,
      deleted: false,
      rehydratePriority: undefined,
      lastAccessedOn: undefined,
      snapshot: undefined,
      blobSequenceNumber: 0
    },
    isCommitted: true,
    pageRangesInOrder: [],
    snapshot: ""
  } as any as BlobModel;
}

/**
 * Helper to build a minimal Append Blob BlobModel for tests.
 */
function buildAppendBlob(
  account: string,
  container: string,
  name: string
): BlobModel {
  const now = new Date();
  return {
    accountName: account,
    containerName: container,
    name,
    properties: {
      creationTime: now,
      lastModified: now,
      etag: `\"etag-${uuid()}\"`,
      blobType: Models.BlobType.AppendBlob,
      contentLength: 0,
      serverEncrypted: false,
      accessTier: undefined,
      accessTierInferred: undefined,
      cacheControl: undefined,
      contentType: undefined,
      contentMD5: undefined,
      contentEncoding: undefined,
      contentLanguage: undefined,
      contentDisposition: undefined,
      leaseDuration: undefined,
      leaseState: Models.LeaseStateType.Available,
      leaseStatus: Models.LeaseStatusType.Unlocked,
      tagCount: undefined,
      archiveStatus: undefined,
      accessTierChangeTime: undefined,
      deletedTime: undefined,
      remainingRetentionDays: undefined,
      deleted: false,
      rehydratePriority: undefined,
      lastAccessedOn: undefined,
      snapshot: undefined,
      isSealed: false
    },
    isCommitted: true,
    committedBlocksInOrder: [],
    snapshot: ""
  } as any as BlobModel;
}

const ACCOUNT = "devstoreaccount1";

describe("LokiBlobMetadataStoreVersioning", () => {
  describe("When blob versioning disabled", () => {
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
      store = new LokiBlobMetadataStore(DB_FILE, true, false);
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
      assert.strictEqual(
        latest.versionId,
        "",
        "Still base version placeholder"
      );
    });

    it("can retrieve a version created while versioning was enabled after disabling versioning @loki", async () => {
      // Close the in-memory disabled store from beforeEach; we need persistence for this scenario
      await store.close();
      await store.clean();

      const name = `blob-${uuid()}`;

      // 1. Create persistent store with versioning enabled (inMemory=false)
      let persistent = new LokiBlobMetadataStore(DB_FILE, false, true);
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
      store = new LokiBlobMetadataStore(DB_FILE, false, false);
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
      assert.strictEqual(snapshotResponse.versionIdHeader, "");

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
      assert.strictEqual(
        afterTier.properties.accessTier,
        Models.AccessTier.Cool
      );
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
      await store.setBlobMetadata(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        { environment: "test" }
      );

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

  describe("When blob versioning enabled", () => {
    let store: LokiBlobMetadataStore;
    let containerName: string;
    let ctx: Context;
    const DB_FILE = "__test_db_blob__.json"; // standard shared test db path

    beforeEach(async () => {
      ctx = createContext();
      containerName = `container-${uuid()}`;
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
      await store.init();
      await store.createContainer(ctx, buildContainer(ACCOUNT, containerName));
    });

    afterEach(async () => {
      await store.close();
      await store.clean();
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
      let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, false);
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
      assert.strictEqual(
        baseFetched.versionId,
        "",
        "Pre-versioning blob should have empty versionId"
      );
      const originalLastModifiedIso =
        baseFetched.properties.lastModified.toISOString();
      await disabledStore.close();

      // 2. Re-open SAME DB with versioning ENABLED.
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
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
      await store.deleteBlob(ctx, ACCOUNT, containerName, name, {}, version1Id);

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
      const initialBlob = buildBlockBlob(
        ACCOUNT,
        containerName,
        name,
        "initial"
      );
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
      await store.setBlobMetadata(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        { "custom-meta": "value" }
      );

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
      assert.ok(!isNullOrWhitespace(snapshotResponse.versionIdHeader));

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
      await store.setBlobMetadata(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        { version: "1" }
      );

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
      await store.setBlobMetadata(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        { version: "2" }
      );

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

    // ================== VERSION MODE TRANSITION TESTS ==================
    it("should handle setBlobMetadata correctly across versioning mode transitions @loki", async () => {
      await store.close();
      await store.clean();

      const name = `blob-${uuid()}`;

      // 1. Create store with versioning DISABLED and create base blob
      let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, false);
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
        { "base-meta": "value1" }
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
      assert.deepStrictEqual(baseFetched.metadata, { "base-meta": "value1" });
      await disabledStore.close();

      // 2. Re-open with versioning ENABLED
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
      await store.init();

      // Set metadata should create new version and promote previous
      ctx.startTime = new Date(Date.now() + 200);
      await store.setBlobMetadata(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        { "versioned-meta": "value2" }
      );

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
      assert.deepStrictEqual(current.metadata, { "versioned-meta": "value2" });

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
      assert.deepStrictEqual(previous.metadata, { "base-meta": "value1" });
    });

    it("should handle setBlobHTTPHeaders correctly across versioning mode transitions @loki", async () => {
      await store.close();
      await store.clean();

      const name = `blob-${uuid()}`;

      // 1. Create store with versioning DISABLED and create base blob
      let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, false);
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
      await disabledStore.close();

      // 2. Re-open with versioning ENABLED
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
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
      let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, false);
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
      await disabledStore.close();

      // 2. Re-open with versioning ENABLED
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
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
      let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, false);
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
      await disabledStore.close();

      // 2. Re-open with versioning ENABLED
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
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
      let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, false);
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
      await disabledStore.close();

      // 2. Re-open with versioning ENABLED
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
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
      let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, false);
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
      await disabledStore.close();

      // 2. Re-open with versioning ENABLED
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
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
      await store.setBlobMetadata(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        { env: "prod" }
      );

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
      let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, false);
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
      assert.strictEqual(snapshotResponse1.versionIdHeader, "");

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
      await disabledStore.close();

      // 2. Re-open with versioning ENABLED
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
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
      assert.ok(!isNullOrWhitespace(snapshotResponse2.versionIdHeader));

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
      let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, false);
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
      await disabledStore.close();

      // 2. Re-open with versioning ENABLED
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
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
      let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, false);
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
      await disabledStore.close();

      // 2. Re-open with versioning ENABLED
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
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
      let disabledStore = new LokiBlobMetadataStore(DB_FILE, false, false);
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
      await disabledStore.close();

      // 2. Re-open with versioning ENABLED
      store = new LokiBlobMetadataStore(DB_FILE, false, true);
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
      await store.deleteBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        {},
        originalLastModifiedIso
      );

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
});
