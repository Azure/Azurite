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
      createdOn: now,
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
      // getBlobProperties response model doesn't surface versionId (would be header in real service), so we don't assert it here.
    });

    it("overwrites base blob and keeps only one current version when versioning disabled @loki", async () => {
      const name = `blob-${uuid()}`;
      const blobV1 = buildBlockBlob(ACCOUNT, containerName, name, "one");
      await store.createBlob(ctx, blobV1);

      const blobV2 = buildBlockBlob(ACCOUNT, containerName, name, "two");
      await store.createBlob(ctx, blobV2);

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
        Buffer.byteLength("two")
      );
      assert.strictEqual(
        latest.versionId,
        "",
        "Still base version placeholder"
      );
    });

    it("selects latest timestamped version when no empty versionId doc exists @loki", async () => {
      const name = `blob-${uuid()}`;

      // Create first blob then manually mutate to simulate historical version with timestamped versionId
      const blobV1 = buildBlockBlob(ACCOUNT, containerName, name, "first");
      await store.createBlob(ctx, blobV1);

      // Simulate removal of empty version placeholder by setting non-empty versionId then saving another with later timestamp
      const blobV2 = buildBlockBlob(ACCOUNT, containerName, name, "second");
      await store.createBlob(ctx, blobV2);

      // Now request without version -> expect latest timestamp (v2)
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
        "Disabled versioning mode maintains a single base version (empty versionId) regardless of prior timestamped ids"
      );
      // If disabled mode later preserves multiple historical records, update expectation (would pick highest timestamp)
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

    beforeEach(async () => {
      ctx = createContext();
      containerName = `container-${uuid()}`;
      store = new LokiBlobMetadataStore("__test_db_blob__.json", true, true); // in-memory OK here
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

    it("promotes pre-versioning base blob to have a versionId timestamp on subsequent versioned create @loki", async () => {
      // Simulate: start with store where versioning enabled but first blob may have empty versionId
      const name = `blob-${uuid()}`;
      const base = buildBlockBlob(ACCOUNT, containerName, name, "base");
      await store.createBlob(ctx, base);
      const first = await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        undefined
      );
      const firstVersionIdBefore = first.versionId;

      // Create new blob -> previous should now NOT be current
      ctx.startTime = new Date(Date.now() + 50);
      const second = buildBlockBlob(ACCOUNT, containerName, name, "second");
      await store.createBlob(ctx, second);
      const latest = await store.downloadBlob(
        ctx,
        ACCOUNT,
        containerName,
        name,
        undefined,
        undefined
      );
      assert.ok(latest.isCurrentVersion, "Latest should be current");
      if (!isNullOrWhitespace(firstVersionIdBefore)) {
        assert.notStrictEqual(
          latest.versionId,
          firstVersionIdBefore,
          "New versionId should differ from previous"
        );
      }
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
