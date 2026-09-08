import {
  StorageSharedKeyCredential,
  BlobServiceClient,
  newPipeline,
  Tags
} from "@azure/storage-blob";
import assert = require("assert");

import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  base64encode,
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  listBlobVersions,
  sleep
} from "../../testutils";
import { parseDateFromAssumedString } from "../../../src/blob/utils/utils";
import { AccountModel } from "../../../src/common/account/AccountModel";
import LokiAccountModelStore from "../../../src/common/account/LokiAccountModelStore";

// Set true to enable debug log
configLogger(false);

const ACCOUNT_DB_FILE = "__test_db_account_models_blockblob_versioning__.json";

function createAccountModelStore(accountModel: AccountModel, inMemory: boolean = false): LokiAccountModelStore {
  const accountModels = new Map<string, AccountModel>();
  accountModels.set(accountModel.key || "devstoreaccount1", accountModel);
  return new LokiAccountModelStore(ACCOUNT_DB_FILE, inMemory, accountModels);
}

describe("BlockBlobVersioningAPIs", () => {
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
  let blockBlobClient = blobClient.getBlockBlobClient();

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
    blockBlobClient = blobClient.getBlockBlobClient();
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  // ===================== BLOCK BLOB SPECIFIC TESTS =====================

  it("should return versionId when uploading a block blob with versioning enabled", async () => {
    const content = "Hello, Versioned World!";
    const uploadResponse = await blockBlobClient.upload(
      content,
      content.length
    );

    // Verify versionId is returned and is a valid date
    assert.ok(
      uploadResponse.versionId,
      "versionId should be present in upload response"
    );
    assert.ok(
      parseDateFromAssumedString(uploadResponse.versionId),
      "versionId should be a valid ISO date string"
    );

    // Verify other response properties
    assert.strictEqual(uploadResponse._response.status, 201);
    assert.ok(uploadResponse.etag);
    assert.ok(uploadResponse.lastModified);
  });

  it("should create new versions when uploading to same blob multiple times", async () => {
    const content1 = "Version 1 content";
    const content2 = "Version 2 content";

    // Upload first version
    const upload1 = await blockBlobClient.upload(content1, content1.length);
    assert.ok(upload1.versionId);
    const version1Id = upload1.versionId!;

    // Small delay to ensure different timestamps
    await sleep(100);

    // Upload second version
    const upload2 = await blockBlobClient.upload(content2, content2.length);
    assert.ok(upload2.versionId);
    const version2Id = upload2.versionId!;

    // Verify different version IDs
    assert.notStrictEqual(version1Id, version2Id);

    // Verify both are valid dates and version2 > version1
    const v1Date = parseDateFromAssumedString(version1Id)!;
    const v2Date = parseDateFromAssumedString(version2Id)!;
    assert.ok(v1Date instanceof Date);
    assert.ok(v2Date instanceof Date);
    assert.ok(v2Date > v1Date, "Second version should have later timestamp");

    const versions = await listBlobVersions(containerClient, blobName);
    assert.strictEqual(versions.length, 2, "Should have two versions listed");
    assert.strictEqual(versions[0].versionId, version1Id);
    assert.strictEqual(versions[1].versionId, version2Id);
  });

  it("should return versionId when committing block list with versioning enabled", async () => {
    const blockIds = [
      base64encode("block1"),
      base64encode("block2"),
      base64encode("block3")
    ];
    const blockContents = [
      "Block 1 content",
      "Block 2 content",
      "Block 3 content"
    ];

    // Stage blocks
    for (let i = 0; i < blockIds.length; i++) {
      await blockBlobClient.stageBlock(
        blockIds[i],
        blockContents[i],
        blockContents[i].length
      );
    }

    // Commit block list
    const commitResponse = await blockBlobClient.commitBlockList(blockIds);

    // Verify versionId is returned
    assert.ok(
      commitResponse.versionId,
      "versionId should be present in commit response"
    );
    assert.ok(
      parseDateFromAssumedString(commitResponse.versionId),
      "versionId should be a valid ISO date string"
    );

    // Verify other response properties
    assert.strictEqual(commitResponse._response.status, 201);
    assert.ok(commitResponse.etag);
    assert.ok(commitResponse.lastModified);
  });

  it("should create new versions when committing block lists multiple times", async () => {
    const blockId1 = base64encode("block1");
    const blockId2 = base64encode("block2");
    const content1 = "First commit content";
    const content2 = "Second commit content";

    // First commit
    await blockBlobClient.stageBlock(blockId1, content1, content1.length);
    const commit1 = await blockBlobClient.commitBlockList([blockId1]);
    assert.ok(commit1.versionId);
    const version1Id = commit1.versionId!;

    await sleep(100);

    // Second commit
    await blockBlobClient.stageBlock(blockId2, content2, content2.length);
    const commit2 = await blockBlobClient.commitBlockList([blockId2]);
    assert.ok(commit2.versionId);
    const version2Id = commit2.versionId!;

    // Verify different version IDs
    assert.notStrictEqual(version1Id, version2Id);

    // Verify chronological order
    const v1Date = parseDateFromAssumedString(version1Id)!;
    const v2Date = parseDateFromAssumedString(version2Id)!;
    assert.ok(v2Date > v1Date, "Second commit should have later timestamp");

    const versions = await listBlobVersions(containerClient, blobName);
    assert.strictEqual(versions.length, 2, "Should have two versions listed");
    assert.strictEqual(versions[0].versionId, version1Id);
    assert.strictEqual(versions[1].versionId, version2Id);
  });

  // ===================== GENERAL BLOB API TESTS =====================
  it("should return versionId when setting blob metadata with versioning enabled", async () => {
    // First create a blob
    const content = "Test blob for metadata";
    const uploadResponse = await blockBlobClient.upload(
      content,
      content.length
    );
    const originalVersionId = uploadResponse.versionId!;

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

    const versions = await listBlobVersions(containerClient, blobName);
    assert.strictEqual(versions.length, 2, "Should have two versions listed");
    assert.strictEqual(versions[0].versionId, originalVersionId);
    assert.strictEqual(versions[1].versionId, setMetadataResponse.versionId!);
  });

  it("should download specific blob version by versionId", async () => {
    const content1 = "Version 1 content";
    const content2 = "Version 2 content";
    const metadata1 = { version: "1" };
    const metadata2 = { version: "2" };

    // Create first version
    const upload1 = await blockBlobClient.upload(content1, content1.length, {
      metadata: metadata1
    });
    const version1Id = upload1.versionId!;

    await sleep(100);

    // Create second version
    const upload2 = await blockBlobClient.upload(content2, content2.length, {
      metadata: metadata2
    });
    const version2Id = upload2.versionId!;

    // Download current version (should be version 2)
    const currentDownload = await blobClient.download();
    const currentContent = await bodyToString(
      currentDownload,
      currentDownload.contentLength
    );
    assert.strictEqual(currentContent, content2);
    assert.strictEqual(currentDownload.metadata?.version, "2");
    assert.strictEqual(currentDownload.versionId, version2Id);
    assert.strictEqual(currentDownload.isCurrentVersion, true);

    // Download specific version 1
    const version1Download = await blobClient
      .withVersion(version1Id)
      .download();
    const version1Content = await bodyToString(
      version1Download,
      version1Download.contentLength
    );
    assert.strictEqual(version1Content, content1);
    assert.strictEqual(version1Download.metadata?.version, "1");
    assert.strictEqual(version1Download.versionId, version1Id);
    assert.strictEqual(version1Download.isCurrentVersion, undefined);

    // Download specific version 2
    const version2Download = await blobClient
      .withVersion(version2Id)
      .download();
    const version2Content = await bodyToString(
      version2Download,
      version2Download.contentLength
    );
    assert.strictEqual(version2Content, content2);
    assert.strictEqual(version2Download.metadata?.version, "2");
    assert.strictEqual(version2Download.versionId, version2Id);
    assert.strictEqual(version2Download.isCurrentVersion, true);
  });

  it("should get properties for specific blob version by versionId", async () => {
    const content = "Test content";
    const metadata1 = { version: "1", author: "user1" };
    const metadata2 = { version: "2", author: "user2" };

    // Create first version
    const upload1 = await blockBlobClient.upload(content, content.length, {
      metadata: metadata1
    });
    const version1Id = upload1.versionId!;

    await sleep(100);

    // Create second version by setting metadata
    const setMetadata = await blobClient.setMetadata(metadata2);
    const version2Id = setMetadata.versionId!;

    // Get properties for version 1
    const props1 = await blobClient.withVersion(version1Id).getProperties();
    assert.strictEqual(props1.versionId, version1Id);
    assert.strictEqual(props1.metadata?.version, "1");
    assert.strictEqual(props1.metadata?.author, "user1");
    assert.strictEqual(props1.isCurrentVersion, undefined);

    // Get properties for version 2
    const props2 = await blobClient.withVersion(version2Id).getProperties();
    assert.strictEqual(props2.versionId, version2Id);
    assert.strictEqual(props2.metadata?.version, "2");
    assert.strictEqual(props2.metadata?.author, "user2");
    assert.strictEqual(props2.isCurrentVersion, true);

    // Get properties for current version (should be version 2)
    const currentProps = await blobClient.getProperties();
    assert.strictEqual(currentProps.versionId, version2Id);
    assert.strictEqual(currentProps.metadata?.version, "2");
    assert.strictEqual(currentProps.metadata?.author, "user2");
    assert.strictEqual(currentProps.isCurrentVersion, true);
  });

  it("should delete specific blob version by versionId", async () => {
    const content1 = "Version 1 content";
    const content2 = "Version 2 content";
    const content3 = "Version 3 content";

    // Create three versions
    const upload1 = await blockBlobClient.upload(content1, content1.length);
    const version1Id = upload1.versionId!;

    await sleep(100);
    const upload2 = await blockBlobClient.upload(content2, content2.length);
    const version2Id = upload2.versionId!;

    await sleep(100);
    const upload3 = await blockBlobClient.upload(content3, content3.length);
    const version3Id = upload3.versionId!;

    // Delete version 2 specifically
    await blobClient.withVersion(version2Id).delete();

    // Verify current version (version 3) still exists
    const currentDownload = await blobClient.download();
    const currentContent = await bodyToString(
      currentDownload,
      currentDownload.contentLength
    );
    assert.strictEqual(currentContent, content3);
    assert.strictEqual(currentDownload.versionId, version3Id);

    // Verify version 1 still exists
    const version1Download = await blobClient
      .withVersion(version1Id)
      .download();
    const version1Content = await bodyToString(
      version1Download,
      version1Download.contentLength
    );
    assert.strictEqual(version1Content, content1);

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

    // Create first version with tags
    const upload1 = await blockBlobClient.upload(content, content.length, {
      tags: tags1
    });
    const version1Id = upload1.versionId!;

    await sleep(100);

    // Create second version (new blob content creates new version)
    const upload2 = await blockBlobClient.upload(
      content + " updated",
      (content + " updated").length,
      { tags: tags2 }
    );
    const version2Id = upload2.versionId!;

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

    // Create blob with original tags
    const upload = await blockBlobClient.upload(content, content.length, {
      tags: originalTags
    });
    const versionId = upload.versionId!;

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

    // Create blobs with multiple versions
    const blob1Client = containerClient.getBlockBlobClient(blobName1);
    const blob2Client = containerClient.getBlockBlobClient(blobName2);

    const upload1v1 = await blob1Client.upload(content1, content1.length);
    await sleep(100);
    const upload1v2 = await blob1Client.upload(
      content1 + " v2",
      (content1 + " v2").length
    );
    await sleep(100);
    const upload2v1 = await blob2Client.upload(content2, content2.length);

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
    assert.strictEqual(blob1Versions[0].versionId, upload1v1.versionId);
    assert.strictEqual(blob1Versions[1].versionId, upload1v2.versionId);
    assert.strictEqual(blob1Versions[0].isCurrentVersion, undefined);
    assert.strictEqual(blob1Versions[1].isCurrentVersion, true);

    // Find blob2 version
    const blob2Versions = blobs.filter((b) => b.name === blobName2);
    assert.strictEqual(blob2Versions.length, 1);
    assert.strictEqual(blob2Versions[0].versionId, upload2v1.versionId);
    assert.strictEqual(blob2Versions[0].isCurrentVersion, true);
  });

  it("should handle blob versioning with delete operations", async () => {
    const content1 = "Version 1";
    const content2 = "Version 2";

    // Create two versions
    const upload1 = await blockBlobClient.upload(content1, content1.length);
    const version1Id = upload1.versionId!;

    await sleep(100);
    const upload2 = await blockBlobClient.upload(content2, content2.length);
    const version2Id = upload2.versionId!;

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
    assert.strictEqual(version1Content, content1);

    const version2Download = await blobClient
      .withVersion(version2Id)
      .download();
    const version2Content = await bodyToString(
      version2Download,
      version2Download.contentLength
    );
    assert.strictEqual(version2Content, content2);
  });

  it("should validate versionId format in API calls", async () => {
    const content = "Test content";
    await blockBlobClient.upload(content, content.length);

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

    // Create initial blob
    const upload = await blockBlobClient.upload(content, content.length);
    const originalVersionId = upload.versionId!;

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
