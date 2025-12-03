import {
  newPipeline,
  BlobServiceClient,
  StorageSharedKeyCredential,
  Tags
} from "@azure/storage-blob";
import assert = require("assert");

import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  sleep
} from "../../testutils";
import { parseDateFromAssumedString } from "../../../src/blob/utils/utils";
import { AccountModel } from "../../../src/blob/AccountModel";
import LokiAccountModelStore from "../../../src/common/account/LokiAccountModelStore";

// Set true to enable debug log
configLogger(false);

const ACCOUNT_DB_FILE = "__test_db_account_models_pageblob_versioning__.json";

function createAccountModelStore(accountModel: AccountModel, inMemory: boolean = false): LokiAccountModelStore {
  const accountModels = new Map<string, AccountModel>();
  accountModels.set(accountModel.key || "devstoreaccount1", accountModel);
  return new LokiAccountModelStore(ACCOUNT_DB_FILE, inMemory, accountModels);
}

describe("PageBlobVersioningAPIs", () => {
  const factory = new BlobTestServerFactory();
  const accountModel: AccountModel =
  {
    key: "devstoreaccount1",
    isBlobVersioningEnabled: true
  }
  const accountModelStore = createAccountModelStore(accountModel, true);
  const server = factory.createServer(false, false, false, undefined, accountModelStore);

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const serviceClient = new BlobServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      }
    )
  );

  let containerName: string = getUniqueName("container");
  let containerClient = serviceClient.getContainerClient(containerName);
  let blobName: string = getUniqueName("blob");
  let blobClient = containerClient.getBlobClient(blobName);
  let pageBlobClient = blobClient.getPageBlobClient();

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
    blobClient = containerClient.getBlobClient(blobName);
    pageBlobClient = blobClient.getPageBlobClient();
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  // ===================== PAGE BLOB SPECIFIC TESTS =====================
  it("should return versionId when creating a page blob with versioning enabled", async () => {
    const createResponse = await pageBlobClient.create(512);

    // Verify versionId is returned and is a valid date
    assert.ok(
      createResponse.versionId,
      "versionId should be present in create response"
    );
    assert.ok(
      parseDateFromAssumedString(createResponse.versionId),
      "versionId should be a valid ISO date string"
    );

    // Verify other response properties
    assert.strictEqual(createResponse._response.status, 201);
    assert.ok(createResponse.etag);
    assert.ok(createResponse.lastModified);
  });

  it("should create new versions when recreating page blob", async () => {
    const metadata1 = { version: "1" };
    const metadata2 = { version: "2" };

    // Create first version
    const create1 = await pageBlobClient.create(512, { metadata: metadata1 });
    assert.ok(create1.versionId);
    const version1Id = create1.versionId!;

    // Small delay to ensure different timestamps
    await sleep(100);

    // Create second version (recreate the blob)
    const create2 = await pageBlobClient.create(512, { metadata: metadata2 });
    assert.ok(create2.versionId);
    const version2Id = create2.versionId!;

    // Verify different version IDs
    assert.notStrictEqual(version1Id, version2Id);

    // Verify both are valid dates and version2 > version1
    const v1Date = parseDateFromAssumedString(version1Id)!;
    const v2Date = parseDateFromAssumedString(version2Id)!;
    assert.ok(v1Date instanceof Date);
    assert.ok(v2Date instanceof Date);
    assert.ok(v2Date > v1Date, "Second version should have later timestamp");
  });

  it("should NOT create new versions when uploading pages", async () => {
    const content1 = "A".repeat(512); // Page content must be 512-byte aligned
    const content2 = "B".repeat(512);

    // Create page blob
    const createResponse = await pageBlobClient.create(1024); // 2 pages
    const originalVersionId = createResponse.versionId!;

    await sleep(100);

    // Upload first page (should NOT create new version)
    await pageBlobClient.uploadPages(content1, 0, content1.length);

    await sleep(100);

    // Upload second page (should NOT create new version)
    await pageBlobClient.uploadPages(content2, 512, content2.length);

    // Verify current blob properties - should still have same version
    const properties = await blobClient.getProperties();
    assert.strictEqual(
      properties.versionId,
      originalVersionId,
      "Page upload operations should not create new versions"
    );

    // Verify content is written correctly
    const download = await blobClient.download();
    const content = await bodyToString(download, download.contentLength);
    assert.strictEqual(content, content1 + content2);
  });

  // ===================== GENERAL BLOB API TESTS =====================
  it("should return versionId when setting blob metadata with versioning enabled", async () => {
    // First create a page blob
    const createResponse = await pageBlobClient.create(512);
    const originalVersionId = createResponse.versionId!;

    await sleep(100);

    // Set metadata (this should create a new version)
    const metadata = { key1: "value1", key2: "value2" };
    const setMetadataResponse = await blobClient.setMetadata(metadata);

    // Verify versionId is returned and is different from original
    assert.ok(
      setMetadataResponse.versionId,
      "versionId should be present in setMetadata response"
    );
    assert.ok(
      parseDateFromAssumedString(setMetadataResponse.versionId),
      "versionId should be a valid ISO date string"
    );
    assert.notStrictEqual(
      setMetadataResponse.versionId,
      originalVersionId,
      "setMetadata should create new version"
    );

    // Verify the new version is later
    const originalDate = parseDateFromAssumedString(originalVersionId)!;
    const newDate = parseDateFromAssumedString(setMetadataResponse.versionId!)!;
    assert.ok(
      newDate > originalDate,
      "New version should have later timestamp"
    );
  });

  it("should download specific blob version by versionId", async () => {
    const content1 = "Version 1 content";
    const content2 = "Version 2 content";
    const metadata1 = { version: "1" };
    const metadata2 = { version: "2" };

    // Create first version (page blob with content)
    const content1Padded = content1.padEnd(512, "\0"); // Pad to 512 bytes
    const create1 = await pageBlobClient.create(512, { metadata: metadata1 });
    await pageBlobClient.uploadPages(content1Padded, 0, 512);
    const version1Id = create1.versionId!;

    await sleep(100);

    // Create second version (recreate page blob with different content)
    const content2Padded = content2.padEnd(512, "\0"); // Pad to 512 bytes
    const create2 = await pageBlobClient.create(512, { metadata: metadata2 });
    await pageBlobClient.uploadPages(content2Padded, 0, 512);
    const version2Id = create2.versionId!;

    // Download current version (should be version 2)
    const currentDownload = await blobClient.download();
    const currentContent = await bodyToString(
      currentDownload,
      currentDownload.contentLength
    );
    assert.strictEqual(currentContent, content2Padded);
    assert.strictEqual(currentDownload.metadata?.version, "2");

    // Download specific version 1
    const version1Download = await blobClient
      .withVersion(version1Id)
      .download();
    const version1Content = await bodyToString(
      version1Download,
      version1Download.contentLength
    );
    assert.strictEqual(version1Content, content1Padded);
    assert.strictEqual(version1Download.metadata?.version, "1");
    assert.strictEqual(version1Download.versionId, version1Id);

    // Download specific version 2
    const version2Download = await blobClient
      .withVersion(version2Id)
      .download();
    const version2Content = await bodyToString(
      version2Download,
      version2Download.contentLength
    );
    assert.strictEqual(version2Content, content2Padded);
    assert.strictEqual(version2Download.metadata?.version, "2");
    assert.strictEqual(version2Download.versionId, version2Id);
  });

  it("should get properties for specific blob version by versionId", async () => {
    const content = "Test content";
    const metadata1 = { version: "1", author: "user1" };
    const metadata2 = { version: "2", author: "user2" };

    // Create first version (page blob with content)
    const contentPadded = content.padEnd(512, "\0"); // Pad to 512 bytes
    const create1 = await pageBlobClient.create(512, { metadata: metadata1 });
    await pageBlobClient.uploadPages(contentPadded, 0, 512);
    const version1Id = create1.versionId!;

    await sleep(100);

    // Create second version by setting metadata
    const setMetadata = await blobClient.setMetadata(metadata2);
    const version2Id = setMetadata.versionId!;

    // Get properties for version 1
    const props1 = await blobClient.withVersion(version1Id).getProperties();
    assert.strictEqual(props1.versionId, version1Id);
    assert.strictEqual(props1.metadata?.version, "1");
    assert.strictEqual(props1.metadata?.author, "user1");

    // Get properties for version 2
    const props2 = await blobClient.withVersion(version2Id).getProperties();
    assert.strictEqual(props2.versionId, version2Id);
    assert.strictEqual(props2.metadata?.version, "2");
    assert.strictEqual(props2.metadata?.author, "user2");

    // Get properties for current version (should be version 2)
    const currentProps = await blobClient.getProperties();
    assert.strictEqual(currentProps.versionId, version2Id);
    assert.strictEqual(currentProps.metadata?.version, "2");
    assert.strictEqual(currentProps.metadata?.author, "user2");
  });

  it("should delete specific blob version by versionId", async () => {
    const content1 = "Version 1 content";
    const content2 = "Version 2 content";
    const content3 = "Version 3 content";

    // Create three versions (recreate page blob each time)
    const content1Padded = content1.padEnd(512, "\0");
    const create1 = await pageBlobClient.create(512);
    await pageBlobClient.uploadPages(content1Padded, 0, 512);
    const version1Id = create1.versionId!;

    await sleep(100);
    const content2Padded = content2.padEnd(512, "\0");
    const create2 = await pageBlobClient.create(512);
    await pageBlobClient.uploadPages(content2Padded, 0, 512);
    const version2Id = create2.versionId!;

    await sleep(100);
    const content3Padded = content3.padEnd(512, "\0");
    const create3 = await pageBlobClient.create(512);
    await pageBlobClient.uploadPages(content3Padded, 0, 512);
    const version3Id = create3.versionId!;

    // Delete version 2 specifically
    await blobClient.withVersion(version2Id).delete();

    // Verify current version (version 3) still exists
    const currentDownload = await blobClient.download();
    const currentContent = await bodyToString(
      currentDownload,
      currentDownload.contentLength
    );
    assert.strictEqual(currentContent, content3Padded);
    assert.strictEqual(currentDownload.versionId, version3Id);

    // Verify version 1 still exists
    const version1Download = await blobClient
      .withVersion(version1Id)
      .download();
    const version1Content = await bodyToString(
      version1Download,
      version1Download.contentLength
    );
    assert.strictEqual(version1Content, content1Padded);

    // Verify version 2 is deleted
    try {
      await blobClient.withVersion(version2Id).download();
      assert.fail("Should have thrown error for deleted version");
    } catch (error: any) {
      assert.ok(error.statusCode === 404 || error.code === "BlobNotFound");
    }
  });

  it("should set and get tags for specific blob version", async () => {
    const content = "Test content for tags";
    const tags1: Tags = { environment: "dev", version: "1.0" };
    const tags2: Tags = { environment: "prod", version: "2.0" };

    // Create first version with tags (page blob)
    const contentPadded = content.padEnd(512, "\0");
    const create1 = await pageBlobClient.create(512, { tags: tags1 });
    await pageBlobClient.uploadPages(contentPadded, 0, 512);
    const version1Id = create1.versionId!;

    await sleep(100);

    // Create second version (recreate page blob with different tags)
    const updatedContent = content + " updated";
    const updatedContentPadded = updatedContent.padEnd(512, "\0");
    const create2 = await pageBlobClient.create(512, { tags: tags2 });
    await pageBlobClient.uploadPages(updatedContentPadded, 0, 512);
    const version2Id = create2.versionId!;

    // Get tags for version 1
    const version1Tags = await blobClient.withVersion(version1Id).getTags();
    assert.deepStrictEqual(version1Tags.tags, tags1);

    // Get tags for version 2
    const version2Tags = await blobClient.withVersion(version2Id).getTags();
    assert.deepStrictEqual(version2Tags.tags, tags2);

    // Get tags for current version (should be version 2)
    const currentTags = await blobClient.getTags();
    assert.deepStrictEqual(currentTags.tags, tags2);
  });

  it("should set tags on specific blob version", async () => {
    const content = "Test content";
    const originalTags: Tags = { original: "true" };
    const newTags: Tags = { updated: "true", version: "modified" };

    // Create page blob with original tags
    const contentPadded = content.padEnd(512, "\0");
    const create = await pageBlobClient.create(512, { tags: originalTags });
    await pageBlobClient.uploadPages(contentPadded, 0, 512);
    const versionId = create.versionId!;

    // Set new tags on the specific version
    await blobClient.withVersion(versionId).setTags(newTags);

    // Verify tags were updated on that version
    const updatedTags = await blobClient.withVersion(versionId).getTags();
    assert.deepStrictEqual(updatedTags.tags, newTags);

    // Verify current version also has the updated tags (since it's the same version)
    const currentTags = await blobClient.getTags();
    assert.deepStrictEqual(currentTags.tags, newTags);
  });

  it("should list blobs with version information", async () => {
    const blobName1 = getUniqueName("blob1");
    const blobName2 = getUniqueName("blob2");
    const content1 = "Content for blob 1";
    const content2 = "Content for blob 2";

    // Create page blobs with multiple versions
    const blob1Client = containerClient.getPageBlobClient(blobName1);
    const blob2Client = containerClient.getPageBlobClient(blobName2);

    const content1Padded = content1.padEnd(512, "\0");
    const create1v1 = await blob1Client.create(512);
    await blob1Client.uploadPages(content1Padded, 0, 512);
    await sleep(100);
    const content1v2Padded = (content1 + " v2").padEnd(512, "\0");
    const create1v2 = await blob1Client.create(512);
    await blob1Client.uploadPages(content1v2Padded, 0, 512);
    await sleep(100);
    const content2Padded = content2.padEnd(512, "\0");
    const create2v1 = await blob2Client.create(512);
    await blob2Client.uploadPages(content2Padded, 0, 512);

    // List blobs with versions
    const listResponse = containerClient.listBlobsFlat({
      includeVersions: true
    });
    const blobs = [];
    for await (const blob of listResponse) {
      blobs.push(blob);
    }

    // Should have 3 versions total (2 for blob1, 1 for blob2)
    assert.strictEqual(blobs.length, 3);

    // Find blob1 versions
    const blob1Versions = blobs
      .filter((b) => b.name === blobName1)
      .sort(
        (a, b) =>
          new Date(a.versionId!).getTime() - new Date(b.versionId!).getTime()
      );
    assert.strictEqual(blob1Versions.length, 2);
    assert.strictEqual(blob1Versions[0].versionId, create1v1.versionId);
    assert.strictEqual(blob1Versions[1].versionId, create1v2.versionId);
    assert.strictEqual(blob1Versions[0].isCurrentVersion, undefined);
    assert.strictEqual(blob1Versions[1].isCurrentVersion, true);

    // Find blob2 version
    const blob2Versions = blobs.filter((b) => b.name === blobName2);
    assert.strictEqual(blob2Versions.length, 1);
    assert.strictEqual(blob2Versions[0].versionId, create2v1.versionId);
    assert.strictEqual(blob2Versions[0].isCurrentVersion, true);
  });

  it("should handle blob versioning with delete operations", async () => {
    const content1 = "Version 1";
    const content2 = "Version 2";

    // Create two versions (recreate page blob each time)
    const content1Padded = content1.padEnd(512, "\0");
    const create1 = await pageBlobClient.create(512);
    await pageBlobClient.uploadPages(content1Padded, 0, 512);
    const version1Id = create1.versionId!;

    await sleep(100);
    const content2Padded = content2.padEnd(512, "\0");
    const create2 = await pageBlobClient.create(512);
    await pageBlobClient.uploadPages(content2Padded, 0, 512);
    const version2Id = create2.versionId!;

    // Delete current version (without specifying version)
    await blobClient.delete();

    // Current version should no longer exist
    try {
      await blobClient.download();
      assert.fail("Should have thrown error for deleted current blob");
    } catch (error: any) {
      assert.ok(error.statusCode === 404 || error.code === "BlobNotFound");
    }

    // But specific versions should still be accessible
    const version1Download = await blobClient
      .withVersion(version1Id)
      .download();
    const version1Content = await bodyToString(
      version1Download,
      version1Download.contentLength
    );
    assert.strictEqual(version1Content, content1Padded);

    const version2Download = await blobClient
      .withVersion(version2Id)
      .download();
    const version2Content = await bodyToString(
      version2Download,
      version2Download.contentLength
    );
    assert.strictEqual(version2Content, content2Padded);
  });

  it("should validate versionId format in API calls", async () => {
    const content = "Test content";
    const contentPadded = content.padEnd(512, "\0");
    await pageBlobClient.create(512);
    await pageBlobClient.uploadPages(contentPadded, 0, 512);

    // Test with invalid versionId format
    const invalidVersionIds = [
      "invalid-date",
      "2024-13-01T00:00:00.000Z", // Invalid month
      "not-a-date-at-all",
      "2024/01/01 00:00:00" // Wrong format
    ];

    for (const invalidVersionId of invalidVersionIds) {
      try {
        await blobClient.withVersion(invalidVersionId).download();
        assert.fail(
          `Should have thrown error for invalid versionId: ${invalidVersionId}`
        );
      } catch (error: any) {
        // Should throw an error for invalid versionId format
        assert.ok(
          error.statusCode === 400 ||
            error.code === "InvalidInput" ||
            error.statusCode === 404
        );
      }
    }
  });

  it("should create snapshot and return versionId when versioning enabled", async () => {
    const content = "Content for snapshot test";

    // Create initial page blob
    const contentPadded = content.padEnd(512, "\0");
    const create = await pageBlobClient.create(512);
    await pageBlobClient.uploadPages(contentPadded, 0, 512);
    const originalVersionId = create.versionId!;

    await sleep(100);

    // Create snapshot (should also create new version)
    const snapshotResponse = await blobClient.createSnapshot();

    // Verify snapshot properties
    assert.ok(
      snapshotResponse.snapshot,
      "snapshot identifier should be present"
    );
    assert.ok(
      snapshotResponse.versionId,
      "versionId should be present in snapshot response"
    );
    assert.ok(
      parseDateFromAssumedString(snapshotResponse.versionId),
      "versionId should be valid date"
    );

    // New version should be different from original
    assert.notStrictEqual(snapshotResponse.versionId, originalVersionId);

    // Verify chronological order
    const originalDate = parseDateFromAssumedString(originalVersionId)!;
    const snapshotDate = parseDateFromAssumedString(
      snapshotResponse.versionId!
    )!;
    assert.ok(
      snapshotDate > originalDate,
      "Snapshot should create later version"
    );
  });
});
