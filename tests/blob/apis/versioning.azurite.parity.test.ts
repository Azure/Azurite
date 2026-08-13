import * as assert from "assert";
import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";
import { isNullOrWhitespace } from "../../../src/blob/utils/utils";
import {
  StorageSharedKeyCredential,
  newPipeline,
  BlobServiceClient,
  ContainerClient,
  BlobItem
} from "@azure/storage-blob";
import { AccountModel } from "../../../src/common/account/AccountModel";
import LokiAccountModelStore from "../../../src/common/account/LokiAccountModelStore";

// Set to true when you want to debug the emulator
configLogger(false);

const ACCOUNT_DB_FILE = "__test_db_account_models_versioning_parity__.json";

function createAccountModelStore(accountModel: AccountModel, inMemory: boolean = true): LokiAccountModelStore {
  const accountModels = new Map<string, AccountModel>();
  accountModels.set(accountModel.key || "devstoreaccount1", accountModel);
  return new LokiAccountModelStore(ACCOUNT_DB_FILE, inMemory, accountModels);
}

describe("Blob Versioning Parity Tests - Azurite", () => {
  const factory = new BlobTestServerFactory();
  let server: any;
  let serviceClient: BlobServiceClient;
  let containerClient: ContainerClient;
  let containerName: string;

  const createServerAndClient = async (versioningEnabled: boolean) => {
    if (server) {
      await server.close();
    }

    const accountModel: AccountModel =
    {
      key: "devstoreaccount1",
      isBlobVersioningEnabled: versioningEnabled
    }

    const accountModelStore = createAccountModelStore(accountModel, true);
    server = factory.createServer(false, false, false, undefined, accountModelStore);

    await server.start();

    const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
    serviceClient = new BlobServiceClient(
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
    containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();
  };

  after(async () => {
    if (server) {
      await server.close();
      await server.clean();
    }
  });

  beforeEach(async () => {
    // Create unique container name for each test
    containerName = getUniqueName("versioning-transition");
  });

  afterEach(async () => {
    if (containerClient) {
      try {
        await containerClient.delete();
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it("should match versioning behaviour from production when setting metadata and downloading @azurite", async () => {
    await createServerAndClient(true);

    const name = getUniqueName("blob");
    const blobClient = containerClient.getAppendBlobClient(name);

    // 1. Create blob with versioning ENABLED
    const createdBlob = await blobClient.create();
    await blobClient.appendBlock("base", 4);
    const createdBlobVersionId = createdBlob.versionId;
    assert.ok(!isNullOrWhitespace(createdBlobVersionId));

    // Set metadata to create new version (should create version when versioning enabled)
    const modifiedMetadataResult = await blobClient.setMetadata({
      versionedmeta: "value1"
    });
    const modifiedVersionId = modifiedMetadataResult.versionId;
    assert.ok(!isNullOrWhitespace(modifiedVersionId));
    assert.notStrictEqual(modifiedVersionId, createdBlobVersionId);

    const versionedFetched = await blobClient.getProperties();
    assert.ok(!isNullOrWhitespace(versionedFetched.versionId));
    assert.deepStrictEqual(versionedFetched.metadata, {
      versionedmeta: "value1"
    });
    assert.strictEqual(versionedFetched.versionId, modifiedVersionId);
    const enabledVersionId = versionedFetched.versionId;

    // 2. Switch to versioning DISABLED
    await createServerAndClient(false);

    // Set metadata should NOT create new version (overwrite current)
    const resp = await blobClient.setMetadata({ disabledmeta: "value2" });
    assert.strictEqual(resp.versionId, undefined);
    assert.notStrictEqual(resp.versionId, enabledVersionId);

    const currentProps = await blobClient.getProperties();
    // With versioning disabled, behavior may vary but metadata should be updated
    assert.deepStrictEqual(currentProps.metadata, {
      disabledmeta: "value2"
    });

    // Should still be able to access the version created when versioning was enabled
    const firstVersionClient = containerClient
      .getBlobClient(name)
      .withVersion(enabledVersionId!);
    const firstVersionProps = await firstVersionClient.getProperties();
    assert.strictEqual(firstVersionProps.versionId, enabledVersionId);
    // Original version should still have the original metadata
    assert.deepStrictEqual(firstVersionProps.metadata, {
      versionedmeta: "value1"
    });

    // 3. Re-enable versioning to verify behaviour
    await createServerAndClient(true);

    const thirdModification = await blobClient.setMetadata({
      versionedmeta: "value3"
    });
    const thirdModificationVersionId = thirdModification.versionId;
    assert.ok(!isNullOrWhitespace(thirdModificationVersionId));
    assert.notStrictEqual(thirdModificationVersionId, createdBlobVersionId);

    const thirdModificationFetched = await blobClient.getProperties();
    assert.ok(!isNullOrWhitespace(thirdModificationFetched.versionId));
    assert.deepStrictEqual(thirdModificationFetched.metadata, {
      versionedmeta: "value3"
    });
    assert.strictEqual(
      thirdModificationFetched.versionId,
      thirdModificationVersionId
    );

    // 4. Switch to versioning DISABLED
    // Verify downloading with versioning disabled returns the same version
    // because no version modification operation was executed.
    await createServerAndClient(false);

    const fetched = await blobClient.download();
    assert.ok(!isNullOrWhitespace(fetched.versionId));
    assert.deepStrictEqual(fetched.versionId, thirdModificationVersionId);

    await blobClient.appendBlock("bob", 3);
    const downloadedAfterAppend = await blobClient.download();
    assert.ok(!isNullOrWhitespace(downloadedAfterAppend.versionId));
    assert.deepStrictEqual(
      downloadedAfterAppend.versionId,
      thirdModificationVersionId
    );
  });

  it("should match versioning behaviour from production when listing blobs after creation operations @production", async () => {
    await createServerAndClient(true);
    
    // Ensure versioning is ENABLED first
    const name = "blobA";
    const blobClient = containerClient.getAppendBlobClient(name);

    // 1. Create blob with versioning ENABLED
    const createdBlob = await blobClient.create();
    await blobClient.appendBlock("base", 4);
    const createdBlobVersionId = createdBlob.versionId;
    assert.ok(!isNullOrWhitespace(createdBlobVersionId));

    // Set metadata to create new version (should create version when versioning enabled)
    const modifiedMetadataResult = await blobClient.setMetadata({
      versionedmeta: "value1"
    });
    const modifiedVersionId = modifiedMetadataResult.versionId;
    assert.ok(!isNullOrWhitespace(modifiedVersionId));
    assert.notStrictEqual(modifiedVersionId, createdBlobVersionId);

    const versionedFetched = await blobClient.getProperties();
    assert.ok(!isNullOrWhitespace(versionedFetched.versionId));
    assert.deepStrictEqual(versionedFetched.metadata, {
      versionedmeta: "value1"
    });
    assert.strictEqual(versionedFetched.versionId, modifiedVersionId);
    const enabledVersionId = versionedFetched.versionId;

    const listingResult = containerClient.listBlobsFlat({
      includeVersions: true
    });
    const pageable = await listingResult.byPage().next();
    assert.strictEqual(pageable.value.segment.blobItems.length, 2);

    for await (const item2 of pageable.value.segment.blobItems) {
      assert.ok(!isNullOrWhitespace((item2 as BlobItem).versionId));
    }

    // 2. Switch to versioning DISABLED
    await createServerAndClient(false);

    const listingResult2 = containerClient.listBlobsFlat({
      includeVersions: true
    });
    const pageable2 = await listingResult2.byPage().next();
    assert.strictEqual(pageable2.value.segment.blobItems.length, 2);

    for await (const item2 of pageable2.value.segment.blobItems) {
      assert.ok(!isNullOrWhitespace((item2 as BlobItem).versionId));
    }

    // Set metadata should NOT create new version (overwrite current)
    const resp = await blobClient.setMetadata({ disabledmeta: "value2" });
    assert.strictEqual(resp.versionId, undefined);
    assert.notStrictEqual(resp.versionId, enabledVersionId);
    await blobClient.createSnapshot();

    const listingResult3 = containerClient.listBlobsFlat({
      includeVersions: true,
      includeSnapshots: true
    });
    const pageable3 = await listingResult3.byPage().next();
    assert.strictEqual(pageable3.value.segment.blobItems.length, 4);

    for await (const item3 of pageable3.value.segment.blobItems) {
      const asBlobModel = item3 as BlobItem;
      assert.ok(!asBlobModel.isCurrentVersion);
    }

    const currentProps = await blobClient.getProperties();
    // With versioning disabled, behavior may vary but metadata should be updated
    assert.deepStrictEqual(currentProps.metadata, {
      disabledmeta: "value2"
    });

    // Should still be able to access the version created when versioning was enabled
    const firstVersionClient = containerClient
      .getBlobClient(name)
      .withVersion(enabledVersionId!);
    const firstVersionProps = await firstVersionClient.getProperties();
    assert.strictEqual(firstVersionProps.versionId, enabledVersionId);
    // Original version should still have the original metadata
    assert.deepStrictEqual(firstVersionProps.metadata, {
      versionedmeta: "value1"
    });
  });

  it("should throw when downloading with both versionId and snapshot @azurite", async () => {
    await createServerAndClient(true);

    const name = getUniqueName("blob");
    const blobClient = containerClient.getBlockBlobClient(name);

    // Create blob
    const created = await blobClient.upload("content", 7);
    const versionId = created.versionId;
    assert.ok(!isNullOrWhitespace(versionId));

    // Create a snapshot
    const snapshot = await blobClient.createSnapshot();

    try {
      // Try to download with both snapshot and versionId - should fail
      await blobClient
        .withVersion(versionId!)
        .withSnapshot(snapshot.snapshot!)
        .download();
      assert.fail(
        "Should have thrown error when versionId provided with snapshot"
      );
    } catch (error: any) {
      // Azure Storage should return an error for this invalid combination
      assert.ok(error.statusCode === 400);
      // Note: Error message may vary between Azure Storage implementations
    }
  });

  it("should throw error when versionId is provided with snapshot option only @azurite", async () => {
    await createServerAndClient(true);

    const name = getUniqueName("blob");
    const blobClient = containerClient.getBlockBlobClient(name);

    // Create blob
    const created = await blobClient.upload("content", 7);

    // Create a snapshot
    await blobClient.createSnapshot();

    try {
      // Try to delete with both snapshot and versionId - should fail
      await blobClient.withVersion(created.versionId!).delete({
        deleteSnapshots: "only"
      });
      assert.fail(
        "Should have thrown error when versionId provided with snapshot operations"
      );
    } catch (error: any) {
      // Azure Storage should return an error for this invalid combination
      assert.ok(
        error.statusCode === 400 ||
          error.code === "InvalidHeaderValue" ||
          error.code === "InvalidQueryParameterValue"
      );
      // Note: Error message may vary between Azure Storage implementations
    }
  });

  it("should throw error when versionId is provided with snapshot option include @azurite", async () => {
    await createServerAndClient(true);

    const name = getUniqueName("blob");
    const blobClient = containerClient.getBlockBlobClient(name);

    // Create blob
    const created = await blobClient.upload("content", 7);

    // Create a snapshot
    await blobClient.createSnapshot();

    try {
      // Try to delete with both snapshot and versionId - should fail
      await blobClient.withVersion(created.versionId!).delete({
        deleteSnapshots: "include"
      });
      assert.fail(
        "Should have thrown error when versionId provided with snapshot operations"
      );
    } catch (error: any) {
      // Azure Storage should return an error for this invalid combination
      assert.ok(error.statusCode === 400);
      // Note: Error message may vary between Azure Storage implementations
    }
  });

  it("should throw error when versionId is provided with snapshot @azurite", async () => {
    await createServerAndClient(true);

    const name = getUniqueName("blob");
    const blobClient = containerClient.getBlockBlobClient(name);

    // Create blob
    const created = await blobClient.upload("content", 7);

    // Create a snapshot
    const snapshot = await blobClient.createSnapshot();

    try {
      // Try to delete with both snapshot and versionId - should fail
      await blobClient
        .withVersion(created.versionId!)
        .withSnapshot(snapshot.snapshot!)
        .delete();
      assert.fail(
        "Should have thrown error when versionId provided with snapshot operations"
      );
    } catch (error: any) {
      // Azure Storage should return an error for this invalid combination
      assert.ok(error.statusCode === 400);
      // Note: Error message may vary between Azure Storage implementations
    }
  });

  it("should set the base blob as a previous version and delete the snapshots @azurite", async () => {
    await createServerAndClient(true);

    const name = getUniqueName("blob");
    const blobClient = containerClient.getBlockBlobClient(name);

    // Create blob
    const created = await blobClient.upload("content", 7);
    const versionId = created.versionId;
    assert.ok(!isNullOrWhitespace(versionId));

    // Create a snapshot
    await blobClient.createSnapshot();

    await blobClient.delete({
      deleteSnapshots: "include"
    });

    const downloadDeleted = await blobClient.withVersion(versionId!).download();
    assert.ok(!isNullOrWhitespace(downloadDeleted.versionId));
  });

  it("should fail to write with versioning enabled because IfNoneMatch was specified @azurite", async () => {
    await createServerAndClient(true);
    const name = getUniqueName("blob");
    const blobClient = containerClient.getBlockBlobClient(name);

    // Create blob
    const created = await blobClient.upload("content", 7);
    const versionId = created.versionId;
    assert.ok(!isNullOrWhitespace(versionId));

    try {
      // Try to upload again with ifNoneMatch: "*" - should fail because blob exists, even with versioning
      await blobClient.upload("new content", 11, {
        conditions: {
          ifNoneMatch: "*"
        }
      });
      assert.fail("Should have thrown error when uploading with ifNoneMatch to existing blob");
    } catch (error: any) {
      // Should fail with 409 Conflict because blob already exists
      assert.ok(error.statusCode === 409 || error.code === "BlobAlreadyExists");
    }
  });
});
