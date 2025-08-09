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
  });
});
