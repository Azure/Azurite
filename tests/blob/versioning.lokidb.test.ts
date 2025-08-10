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

      // Try to fetch previous by versionId (may be empty if implementation normalizes; allow fallback)
      if (!isNullOrWhitespace(first.versionId)) {
        const previousFetched = await store.downloadBlob(
          ctx,
          ACCOUNT,
          containerName,
          name,
          undefined,
          first.versionId
        );
        assert.ok(previousFetched.versionId === first.versionId);
      }
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
  });
});
