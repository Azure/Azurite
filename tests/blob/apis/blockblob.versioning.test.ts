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
  sleep
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("BlockBlobVersioningAPIs", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer(false, false, false, undefined, true);

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

  it("should create blob successfully and return properties when versioning enabled @loki @sql", async () => {
    const body: string = getUniqueName("initialcontent");
    const uploadResult = await blockBlobClient.upload(body, body.length);

    assert.strictEqual(
      uploadResult._response.request.headers.get("x-ms-client-request-id"),
      uploadResult.clientRequestId
    );

    const properties = await blobClient.getProperties();
    assert.ok(
      properties,
      "Properties should be returned, indicating blob was created successfully"
    );
  });

  it("should create new version on subsequent block blob uploads @loki @sql", async () => {
    const firstBody = getUniqueName("firstversion");
    const secondBody = getUniqueName("secondversion");

    // Upload first version
    const firstUpload = await blockBlobClient.upload(
      firstBody,
      firstBody.length
    );
    const firstVersionId = firstUpload.versionId;
    assert.ok(firstVersionId, "First upload should have version ID");

    // Upload second version - should create new version
    const secondUpload = await blockBlobClient.upload(
      secondBody,
      secondBody.length
    );
    const secondVersionId = secondUpload.versionId;
    assert.ok(secondVersionId, "Second upload should have version ID");
    assert.notEqual(
      firstVersionId,
      secondVersionId,
      "Version IDs should be different"
    );

    // Current version should be the second upload
    const currentProperties = await blobClient.getProperties();
    assert.equal(
      currentProperties.versionId,
      secondVersionId,
      "Current version should be the latest"
    );
    assert.ok(
      currentProperties.isCurrentVersion,
      "Should be marked as current version"
    );

    // Download current version should return second content
    const downloadResult = await blobClient.download(0);
    const downloadedContent = await bodyToString(
      downloadResult,
      secondBody.length
    );
    assert.equal(
      downloadedContent,
      secondBody,
      "Current version should contain second content"
    );
  });

  it("should allow access to specific blob version by version ID @loki @sql", async () => {
    const firstContent = getUniqueName("version1content");
    const secondContent = getUniqueName("version2content");

    // Create first version
    const firstUpload = await blockBlobClient.upload(
      firstContent,
      firstContent.length
    );
    const firstVersionId = firstUpload.versionId!;

    // Create second version
    const secondUpload = await blockBlobClient.upload(
      secondContent,
      secondContent.length
    );
    const secondVersionId = secondUpload.versionId!;

    // Access first version specifically
    const firstVersionClient = blobClient.withVersion(firstVersionId);
    const firstVersionDownload = await firstVersionClient.download(0);
    const firstVersionContent = await bodyToString(
      firstVersionDownload,
      firstContent.length
    );
    assert.equal(
      firstVersionContent,
      firstContent,
      "First version should contain original content"
    );

    // Access second version specifically
    const secondVersionClient = blobClient.withVersion(secondVersionId);
    const secondVersionDownload = await secondVersionClient.download(0);
    const secondVersionContent = await bodyToString(
      secondVersionDownload,
      secondContent.length
    );
    assert.equal(
      secondVersionContent,
      secondContent,
      "Second version should contain updated content"
    );
  });

  it("should create new version when uploading with metadata and HTTP headers @loki @sql", async () => {
    const firstBody = getUniqueName("contentwithmetadata");
    const firstMetadata = { key1: "value1", key2: "value2" };
    const firstHeaders = {
      blobCacheControl: "first-cache-control",
      blobContentType: "text/plain"
    };

    // First upload with metadata and headers
    const firstUpload = await blockBlobClient.upload(
      firstBody,
      firstBody.length,
      {
        metadata: firstMetadata,
        blobHTTPHeaders: firstHeaders
      }
    );
    const firstVersionId = firstUpload.versionId!;

    const secondBody = getUniqueName("updatedcontent");
    const secondMetadata = { key1: "newvalue1", key3: "value3" };
    const secondHeaders = {
      blobCacheControl: "second-cache-control",
      blobContentType: "application/json"
    };

    // Second upload with different metadata and headers
    const secondUpload = await blockBlobClient.upload(
      secondBody,
      secondBody.length,
      {
        metadata: secondMetadata,
        blobHTTPHeaders: secondHeaders
      }
    );
    const secondVersionId = secondUpload.versionId!;

    assert.notEqual(
      firstVersionId,
      secondVersionId,
      "Should create new version"
    );

    // Verify first version retains original metadata and headers
    const firstVersionClient = blobClient.withVersion(firstVersionId);
    const firstVersionProps = await firstVersionClient.getProperties();
    assert.deepEqual(
      firstVersionProps.metadata,
      firstMetadata,
      "First version should retain original metadata"
    );
    assert.equal(
      firstVersionProps.cacheControl,
      firstHeaders.blobCacheControl,
      "First version should retain original cache control"
    );

    // Verify second version has updated metadata and headers
    const currentProps = await blobClient.getProperties();
    assert.deepEqual(
      currentProps.metadata,
      secondMetadata,
      "Current version should have updated metadata"
    );
    assert.equal(
      currentProps.cacheControl,
      secondHeaders.blobCacheControl,
      "Current version should have updated cache control"
    );
  });

  it("should create new version on commitBlockList operation @loki @sql", async () => {
    const blockContent = "HelloBlockWorld";

    // Stage some blocks
    await blockBlobClient.stageBlock(
      base64encode("block1"),
      blockContent,
      blockContent.length
    );
    await blockBlobClient.stageBlock(
      base64encode("block2"),
      blockContent,
      blockContent.length
    );

    // First commit should create initial version
    const firstCommit = await blockBlobClient.commitBlockList([
      base64encode("block1"),
      base64encode("block2")
    ]);
    const firstVersionId = firstCommit.versionId;
    assert.ok(firstVersionId, "First commit should create version");

    // Stage additional blocks
    await blockBlobClient.stageBlock(
      base64encode("block3"),
      blockContent,
      blockContent.length
    );

    // Second commit should create new version
    const secondCommit = await blockBlobClient.commitBlockList([
      base64encode("block1"),
      base64encode("block3")
    ]);
    const secondVersionId = secondCommit.versionId;
    assert.ok(secondVersionId, "Second commit should create version");
    assert.notEqual(
      firstVersionId,
      secondVersionId,
      "Should create different version"
    );

    // Verify block lists are different between versions
    const firstVersionBlobClient = blobClient.withVersion(firstVersionId!);
    const firstVersionBlockBlobClient =
      firstVersionBlobClient.getBlockBlobClient();
    const firstVersionBlocks =
      await firstVersionBlockBlobClient.getBlockList("committed");
    assert.equal(
      firstVersionBlocks.committedBlocks!.length,
      2,
      "First version should have 2 blocks"
    );
    assert.equal(
      firstVersionBlocks.committedBlocks![0].name,
      base64encode("block1")
    );
    assert.equal(
      firstVersionBlocks.committedBlocks![1].name,
      base64encode("block2")
    );

    const currentBlocks = await blockBlobClient.getBlockList("committed");
    assert.equal(
      currentBlocks.committedBlocks!.length,
      2,
      "Current version should have 2 blocks"
    );
    assert.equal(
      currentBlocks.committedBlocks![0].name,
      base64encode("block1")
    );
    assert.equal(
      currentBlocks.committedBlocks![1].name,
      base64encode("block3")
    );
  });

  it("should create new version when committing empty block list @loki @sql", async () => {
    // First commit - empty blob
    const firstCommit = await blockBlobClient.commitBlockList([]);
    const firstVersionId = firstCommit.versionId;
    assert.ok(firstVersionId, "First empty commit should create version");

    // Verify first version is empty
    const firstVersionClient = blobClient.withVersion(firstVersionId!);
    const firstVersionDownload = await firstVersionClient.download(0);
    const firstVersionContent = await bodyToString(firstVersionDownload, 0);
    assert.equal(firstVersionContent, "", "First version should be empty");

    // Add some content
    const content = "some content";
    const secondCommit = await blockBlobClient.upload(content, content.length);
    const secondVersionId = secondCommit.versionId;
    assert.notEqual(
      firstVersionId,
      secondVersionId,
      "Should create new version"
    );

    // Commit empty list again - should create another version
    const thirdCommit = await blockBlobClient.commitBlockList([]);
    const thirdVersionId = thirdCommit.versionId;
    assert.notEqual(
      secondVersionId,
      thirdVersionId,
      "Should create third version"
    );

    // Verify current version is empty again
    const currentDownload = await blobClient.download(0);
    const currentContent = await bodyToString(currentDownload, 0);
    assert.equal(currentContent, "", "Current version should be empty again");
  });

  it("should preserve version-specific properties when accessing older versions @loki @sql", async () => {
    const firstContent = "version1";
    const firstMetadata = { environment: "test", version: "1.0" };
    const firstHeaders = {
      blobContentType: "text/plain",
      blobContentLanguage: "en-US"
    };

    // Create first version
    const firstUpload = await blockBlobClient.upload(
      firstContent,
      firstContent.length,
      {
        metadata: firstMetadata,
        blobHTTPHeaders: firstHeaders
      }
    );
    const firstVersionId = firstUpload.versionId!;

    // Wait a moment to ensure different timestamps
    await sleep(1000);

    const secondContent = "version2-updated";
    const secondMetadata = {
      environment: "production",
      version: "2.0",
      newfield: "newvalue"
    };
    const secondHeaders = {
      blobContentType: "application/json",
      blobContentLanguage: "en-GB"
    };

    // Create second version
    await blockBlobClient.upload(secondContent, secondContent.length, {
      metadata: secondMetadata,
      blobHTTPHeaders: secondHeaders
    });

    // Access first version and verify its properties are preserved
    const firstVersionClient = blobClient.withVersion(firstVersionId);
    const firstVersionProps = await firstVersionClient.getProperties();

    assert.deepEqual(
      firstVersionProps.metadata,
      firstMetadata,
      "First version metadata should be preserved"
    );
    assert.equal(
      firstVersionProps.contentType,
      firstHeaders.blobContentType,
      "First version content type should be preserved"
    );
    assert.equal(
      firstVersionProps.contentLanguage,
      firstHeaders.blobContentLanguage,
      "First version content language should be preserved"
    );
    assert.equal(
      firstVersionProps.contentLength,
      firstContent.length,
      "First version content length should be preserved"
    );
    assert.equal(
      firstVersionProps.versionId,
      firstVersionId,
      "Version ID should match"
    );
    assert.equal(
      firstVersionProps.isCurrentVersion,
      false,
      "Should not be current version"
    );

    // Verify first version content
    const firstVersionDownload = await firstVersionClient.download(0);
    const firstVersionContent = await bodyToString(
      firstVersionDownload,
      firstContent.length
    );
    assert.equal(
      firstVersionContent,
      firstContent,
      "First version content should be preserved"
    );
  });

  it("should handle concurrent uploads creating different versions @loki @sql", async () => {
    const content1 = "concurrent-upload-1";
    const content2 = "concurrent-upload-2";
    const content3 = "concurrent-upload-3";

    // Simulate concurrent uploads
    const [upload1, upload2, upload3] = await Promise.all([
      blockBlobClient.upload(content1, content1.length),
      blockBlobClient.upload(content2, content2.length),
      blockBlobClient.upload(content3, content3.length)
    ]);

    // All uploads should have version IDs
    assert.ok(upload1.versionId, "First upload should have version ID");
    assert.ok(upload2.versionId, "Second upload should have version ID");
    assert.ok(upload3.versionId, "Third upload should have version ID");

    // All version IDs should be different
    const versionIds = [
      upload1.versionId!,
      upload2.versionId!,
      upload3.versionId!
    ];
    const uniqueVersionIds = new Set(versionIds);
    assert.equal(uniqueVersionIds.size, 3, "All version IDs should be unique");

    // The current version should be one of the uploaded versions
    const currentProps = await blobClient.getProperties();
    assert.ok(
      versionIds.includes(currentProps.versionId!),
      "Current version should be one of the uploaded versions"
    );
  });

  it("should support conditional requests with versioning @loki @sql", async () => {
    const initialContent = "initial-conditional-content";
    const updatedContent = "updated-conditional-content";

    // Create initial version
    const initialUpload = await blockBlobClient.upload(
      initialContent,
      initialContent.length
    );
    const etag = initialUpload.etag!;
    const versionId = initialUpload.versionId!;

    // Conditional upload with matching ETag should succeed and create new version
    const conditionalUpload = await blockBlobClient.upload(
      updatedContent,
      updatedContent.length,
      {
        conditions: { ifMatch: etag }
      }
    );

    assert.ok(
      conditionalUpload.versionId,
      "Conditional upload should create new version"
    );
    assert.notEqual(
      conditionalUpload.versionId,
      versionId,
      "Should create different version"
    );

    // Verify original version is still accessible
    const originalVersionClient = blobClient.withVersion(versionId);
    const originalDownload = await originalVersionClient.download(0);
    const originalContent = await bodyToString(
      originalDownload,
      initialContent.length
    );
    assert.equal(
      originalContent,
      initialContent,
      "Original version should be preserved"
    );

    // Conditional upload with non-matching ETag should fail
    try {
      await blockBlobClient.upload("should-fail", 11, {
        conditions: { ifMatch: etag } // This ETag is now stale
      });
      assert.fail("Should have failed with stale ETag");
    } catch (error) {
      assert.equal(
        error.statusCode,
        412,
        "Should fail with precondition failed"
      );
    }
  });

  it("should support tag-based conditional operations with versioning @loki @sql", async () => {
    const content1 = "tagged-content-v1";
    const content2 = "tagged-content-v2";
    const tags: Tags = { environment: "test", version: "1.0" };

    // Create initial version with tags
    const initialUpload = await blockBlobClient.upload(
      content1,
      content1.length
    );
    await blockBlobClient.setTags(tags);
    const initialVersionId = initialUpload.versionId!;

    // Conditional upload based on tags should succeed
    const conditionalUpload = await blockBlobClient.upload(
      content2,
      content2.length,
      {
        conditions: { tagConditions: "environment='test'" }
      }
    );

    assert.ok(
      conditionalUpload.versionId,
      "Tag-conditional upload should create new version"
    );
    assert.notEqual(
      conditionalUpload.versionId,
      initialVersionId,
      "Should create different version"
    );

    // Verify original version still has the tags
    const originalVersionClient = blobClient.withVersion(initialVersionId);
    const originalTags = await originalVersionClient.getTags();
    assert.deepEqual(
      originalTags.tags,
      tags,
      "Original version should retain tags"
    );

    // Tag-conditional upload with non-matching condition should fail
    try {
      await blockBlobClient.upload("should-fail", 11, {
        conditions: { tagConditions: "environment='production'" }
      });
      assert.fail("Should have failed with non-matching tag condition");
    } catch (error) {
      assert.equal(
        error.statusCode,
        412,
        "Should fail with precondition failed"
      );
    }
  });

  it("should maintain version history across multiple operations @loki @sql", async () => {
    const versions: Array<{
      content: string;
      versionId: string;
      metadata?: any;
    }> = [];

    // Create multiple versions with different operations

    // Version 1: Simple upload
    const content1 = "version-1-simple";
    const upload1 = await blockBlobClient.upload(content1, content1.length);
    versions.push({ content: content1, versionId: upload1.versionId! });

    // Version 2: Upload with metadata
    const content2 = "version-2-with-metadata";
    const metadata2 = { operation: "upload", sequence: "2" };
    const upload2 = await blockBlobClient.upload(content2, content2.length, {
      metadata: metadata2
    });
    versions.push({
      content: content2,
      versionId: upload2.versionId!,
      metadata: metadata2
    });

    // Version 3: Block list commit
    const blockContent = "block-content";
    await blockBlobClient.stageBlock(
      base64encode("1"),
      blockContent,
      blockContent.length
    );
    await blockBlobClient.stageBlock(
      base64encode("2"),
      blockContent,
      blockContent.length
    );
    const commit3 = await blockBlobClient.commitBlockList([
      base64encode("1"),
      base64encode("2")
    ]);
    const content3 = blockContent.repeat(2);
    versions.push({ content: content3, versionId: commit3.versionId! });

    // Version 4: Empty commit
    const commit4 = await blockBlobClient.commitBlockList([]);
    versions.push({ content: "", versionId: commit4.versionId! });

    // Verify all versions are accessible and contain expected content
    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];
      const versionClient = blobClient.withVersion(version.versionId);

      // Verify content
      const download = await versionClient.download(0);
      const content = await bodyToString(download, version.content.length);
      assert.equal(
        content,
        version.content,
        `Version ${i + 1} should have correct content`
      );

      // Verify metadata if present
      if (version.metadata) {
        const props = await versionClient.getProperties();
        assert.deepEqual(
          props.metadata,
          version.metadata,
          `Version ${i + 1} should have correct metadata`
        );
      }

      // Verify version properties
      const props = await versionClient.getProperties();
      assert.equal(
        props.versionId,
        version.versionId,
        `Version ${i + 1} should have correct version ID`
      );
      assert.equal(
        props.isCurrentVersion,
        i === versions.length - 1,
        `Only last version should be current`
      );
    }
  });

  it("should handle versioning with copy operations @loki @sql", async () => {
    const sourceContent = "source-content-for-copy";
    const sourceMetadata = { source: "original", purpose: "copy-test" };

    // Create source blob with content and metadata
    await blockBlobClient.upload(sourceContent, sourceContent.length, {
      metadata: sourceMetadata
    });

    // Create destination blob
    const destBlobName = getUniqueName("dest-blob");
    const destBlobClient = containerClient.getBlockBlobClient(destBlobName);

    // Copy should create new version in destination
    const copyResult = await (
      await destBlobClient.beginCopyFromURL(blockBlobClient.url)
    ).pollUntilDone();
    assert.ok(
      copyResult.versionId,
      "Copy operation should create version in destination"
    );

    // Verify copied content and metadata
    const destProps = await destBlobClient.getProperties();
    assert.equal(
      destProps.versionId,
      copyResult.versionId,
      "Version IDs should match"
    );
    assert.deepEqual(
      destProps.metadata,
      sourceMetadata,
      "Metadata should be copied"
    );

    const destDownload = await destBlobClient.download(0);
    const destContent = await bodyToString(destDownload, sourceContent.length);
    assert.equal(destContent, sourceContent, "Content should be copied");

    // Subsequent copy should create new version
    const sourceContent2 = "updated-source-content";
    await blockBlobClient.upload(sourceContent2, sourceContent2.length);

    const copyResult2 = await (
      await destBlobClient.beginCopyFromURL(blockBlobClient.url)
    ).pollUntilDone();
    assert.ok(copyResult2.versionId, "Second copy should create version");
    assert.notEqual(
      copyResult2.versionId,
      copyResult.versionId,
      "Should create different version"
    );

    // Verify first version is still accessible
    const firstVersionClient = destBlobClient.withVersion(
      copyResult.versionId!
    );
    const firstVersionDownload = await firstVersionClient.download(0);
    const firstVersionContent = await bodyToString(
      firstVersionDownload,
      sourceContent.length
    );
    assert.equal(
      firstVersionContent,
      sourceContent,
      "First version should contain original content"
    );
  });
});
