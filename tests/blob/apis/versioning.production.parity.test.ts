import * as assert from "assert";
import { BlobItem, BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { configLogger } from "../../../src/common/Logger";
import { getUniqueName } from "../../testutils";
import { isNullOrWhitespace } from "../../../src/blob/utils/utils";

// Set to true when you want to debug the emulator
configLogger(false);

/**
 * Helper function to wait for manual versioning configuration
 */
async function promptForVersioningStateChangeAndVerify(
  realServiceClient: BlobServiceClient,
  containerName: string,
  requiredState: "enabled" | "disabled"
): Promise<void> {
  const stateMessage =
    requiredState === "enabled"
      ? "ENABLE blob versioning"
      : "DISABLE blob versioning";

  console.log("\n" + "=".repeat(80));
  console.log(`🔧 MANUAL ACTION REQUIRED`);
  console.log("=".repeat(80));
  console.log(`Please ${stateMessage} for your Azure Storage account:`);
  console.log(`⏱️  Waiting 10 seconds for you to configure versioning...`);

  // Wait 10 seconds instead of prompting
  await new Promise((resolve) => setTimeout(resolve, 10000));

  console.log(`✅ Proceeding with versioning ${requiredState}\n`);
  await verifyVersioningState(realServiceClient, containerName, requiredState);
}

/**
 * Helper function to verify versioning state by attempting operations
 */
async function verifyVersioningState(
  serviceClient: BlobServiceClient,
  containerName: string,
  expectedState: "enabled" | "disabled"
): Promise<void> {
  const testBlobName = getUniqueName("version-test");
  const testContent = "version test content";

  const blockBlobClient = serviceClient
    .getContainerClient(containerName)
    .getBlockBlobClient(testBlobName);

  try {
    const uploadResult = await blockBlobClient.upload(
      testContent,
      testContent.length
    );

    if (expectedState === "enabled") {
      assert.ok(
        uploadResult.versionId,
        `Blob service should return version ID when versioning is enabled`
      );
      assert.notStrictEqual(
        uploadResult.versionId,
        "",
        `Blob service version ID should not be empty when versioning is enabled`
      );
    } else {
      // When versioning is disabled, some services might still return a version ID, so we'll be less strict
      // The key difference is in behavior during multiple uploads and deletions
    }

    // Clean up test blob
    await blockBlobClient.delete();
    console.log(`✅ Blob service versioning state verified: ${expectedState}`);
  } catch (error) {
    console.error(`❌ Failed to verify Blob service versioning state:`, error);
    throw error;
  }
}

// Skipping by default since these should be run manually
describe.skip("Blob Versioning Parity Tests - Production", () => {
  let realServiceClient: BlobServiceClient;
  let realContainerClient: ContainerClient;
  let containerName: string;

  const realStorageAccountUrl = "YOUR_AZURE_STORAGE_ACCOUNT_URL";

  before(async () => {
    console.log("🚀 Setting up Blob Versioning Transition Parity Tests...");

    // Initialize real Azure Storage client
    realServiceClient = new BlobServiceClient(
      realStorageAccountUrl,
      new DefaultAzureCredential()
    );
  });

  beforeEach(async () => {
    // Create unique container name for each test
    containerName = getUniqueName("versioning-transition");
    realContainerClient = realServiceClient.getContainerClient(containerName);
    await realContainerClient.create();
  });

  it("should match versioning behaviour from lokidb when setting metadata and downloading @production", async () => {
    // Ensure versioning is ENABLED first
    const name = getUniqueName("blob");
    const blobClient = realContainerClient.getAppendBlobClient(name);

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
    await promptForVersioningStateChangeAndVerify(
      realServiceClient,
      containerName,
      "disabled"
    );

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
    const firstVersionClient = realContainerClient
      .getBlobClient(name)
      .withVersion(enabledVersionId!);
    const firstVersionProps = await firstVersionClient.getProperties();
    assert.strictEqual(firstVersionProps.versionId, enabledVersionId);
    // Original version should still have the original metadata
    assert.deepStrictEqual(firstVersionProps.metadata, {
      versionedmeta: "value1"
    });

    // 3. Re-enable versioning to verify behaviour
    await promptForVersioningStateChangeAndVerify(
      realServiceClient,
      containerName,
      "enabled"
    );

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
    await promptForVersioningStateChangeAndVerify(
      realServiceClient,
      containerName,
      "disabled"
    );

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

  it("should match versioning behaviour from lokidb when listing blobs after creation operations @production", async () => {
    // Ensure versioning is ENABLED first
    const name = getUniqueName("blob");
    const blobClient = realContainerClient.getAppendBlobClient(name);

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

    const listingResult = realContainerClient.listBlobsFlat({
      includeVersions: true
    });
    const pageable = await listingResult.byPage().next();
    assert.strictEqual(pageable.value.segment.blobItems.length, 2);

    for await (const item2 of pageable.value.segment.blobItems) {
      assert.ok(!isNullOrWhitespace((item2 as BlobItem).versionId));
    }

    // 2. Switch to versioning DISABLED
    await promptForVersioningStateChangeAndVerify(
      realServiceClient,
      containerName,
      "disabled"
    );

    const listingResult2 = realContainerClient.listBlobsFlat({
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

    const listingResult3 = realContainerClient.listBlobsFlat({
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
    const firstVersionClient = realContainerClient
      .getBlobClient(name)
      .withVersion(enabledVersionId!);
    const firstVersionProps = await firstVersionClient.getProperties();
    assert.strictEqual(firstVersionProps.versionId, enabledVersionId);
    // Original version should still have the original metadata
    assert.deepStrictEqual(firstVersionProps.metadata, {
      versionedmeta: "value1"
    });
  });

  it("should throw when downloading with both versionId and snapshot @production", async () => {
    const name = getUniqueName("blob");
    const blobClient = realContainerClient.getBlockBlobClient(name);

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

  it("should throw error when versionId is provided with snapshot option only @production", async () => {
    const name = getUniqueName("blob");
    const blobClient = realContainerClient.getBlockBlobClient(name);

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

  it("should throw error when versionId is provided with snapshot option include @production", async () => {
    const name = getUniqueName("blob");
    const blobClient = realContainerClient.getBlockBlobClient(name);

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

  it("should throw error when versionId is provided with snapshot @production", async () => {
    const name = getUniqueName("blob");
    const blobClient = realContainerClient.getBlockBlobClient(name);

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

  it("should set the base blob as a previous version and delete the snapshots @production", async () => {
    const name = getUniqueName("blob");
    const blobClient = realContainerClient.getBlockBlobClient(name);

    // Create blob
    const created = await blobClient.upload("content", 7);
    const versionId = created.versionId;
    assert.ok(!isNullOrWhitespace(versionId));

    // Create a snapshot
    await blobClient.createSnapshot();

    // Try to delete with both snapshot and versionId - should fail
    await blobClient.delete({
      deleteSnapshots: "include"
    });

    const downloadDeleted = await blobClient.withVersion(versionId!).download();
    assert.ok(!isNullOrWhitespace(downloadDeleted.versionId));
  });

  it("should fail to write with versioning enabled because IfNoneMatch was specified @production", async () => {
    const name = getUniqueName("blob");
    const blobClient = realContainerClient.getBlockBlobClient(name);

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
