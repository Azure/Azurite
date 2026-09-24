/**
 * SDK Integration Tests for ADLS Gen2 (DFS) endpoint.
 *
 * Uses @azure/storage-file-datalake SDK to validate that the Azurite DFS
 * endpoint is compatible with the official Azure DataLake SDK.
 *
 * Wiki requirement: "Pass all language SDK tests" — this covers the JS SDK.
 */

import {
  DataLakeServiceClient,
  DataLakeFileSystemClient,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";
import * as assert from "assert";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../testutils";

configLogger(false);

describe("DFS SDK Integration (@azure/storage-file-datalake)", () => {
  const factory = new BlobTestServerFactory();
  const blobServer = factory.createServer(false, true, false, undefined, true);

  const sharedKeyCredential = new StorageSharedKeyCredential(
    EMULATOR_ACCOUNT_NAME,
    EMULATOR_ACCOUNT_KEY
  );

  const serviceClient = new DataLakeServiceClient(
    `http://${blobServer.config.host}:${blobServer.config.port}/${EMULATOR_ACCOUNT_NAME}`,
    sharedKeyCredential
  );

  before(async () => {
    await blobServer.start();
  });

  after(async () => {
    await blobServer.close();
    await blobServer.clean();
  });

  // ---------------------------------------------------------------------------
  // Filesystem operations
  // ---------------------------------------------------------------------------

  describe("Filesystem operations", () => {
    it("creates and deletes a filesystem @loki @sql", async () => {
      const fsName = getUniqueName("sdkfs");
      const fsClient = serviceClient.getFileSystemClient(fsName);

      const createResponse = await fsClient.create();
      assert.strictEqual(createResponse._response.status, 201);

      const deleteResponse = await fsClient.delete();
      assert.strictEqual(deleteResponse._response.status, 202);
    });

    it("gets filesystem properties @loki @sql", async () => {
      const fsName = getUniqueName("sdkfs");
      const fsClient = serviceClient.getFileSystemClient(fsName);
      await fsClient.create();

      const props = await fsClient.getProperties();
      assert.ok(props.etag);
      assert.ok(props.lastModified);

      await fsClient.delete();
    });

    it("lists filesystems @loki @sql", async () => {
      const fsName = getUniqueName("sdkfs");
      const fsClient = serviceClient.getFileSystemClient(fsName);
      await fsClient.create();

      const filesystems: string[] = [];
      for await (const fs of serviceClient.listFileSystems()) {
        filesystems.push(fs.name);
      }
      assert.ok(filesystems.includes(fsName), `Expected ${fsName} in filesystem list`);

      await fsClient.delete();
    });
  });

  // ---------------------------------------------------------------------------
  // Directory operations
  // ---------------------------------------------------------------------------

  describe("Directory operations", () => {
    let fsClient: DataLakeFileSystemClient;

    beforeEach(async () => {
      fsClient = serviceClient.getFileSystemClient(getUniqueName("sdkfs"));
      await fsClient.create();
    });

    afterEach(async () => {
      await fsClient.delete();
    });

    it("creates and deletes a directory @loki @sql", async () => {
      const dirClient = fsClient.getDirectoryClient("test-dir");
      const createResponse = await dirClient.create();
      assert.strictEqual(createResponse._response.status, 201);

      const props = await dirClient.getProperties();
      assert.ok(props.etag);

      await dirClient.delete();
    });

    it("creates nested directories @loki @sql", async () => {
      const dirClient = fsClient.getDirectoryClient("parent/child/grandchild");
      await dirClient.create();

      // Verify all intermediate dirs exist
      const parentProps = await fsClient.getDirectoryClient("parent").getProperties();
      assert.ok(parentProps.etag);

      const childProps = await fsClient.getDirectoryClient("parent/child").getProperties();
      assert.ok(childProps.etag);

      const grandchildProps = await dirClient.getProperties();
      assert.ok(grandchildProps.etag);

      await fsClient.getDirectoryClient("parent").delete(true);
    });

    it("moves (renames) a directory @loki @sql", async () => {
      const srcDir = fsClient.getDirectoryClient("src-dir");
      await srcDir.create();

      // Create a file inside
      const fileClient = srcDir.getFileClient("file.txt");
      await fileClient.create();

      // Move (rename) directory
      await srcDir.move("dest-dir");

      // Verify new path exists
      const destProps = await fsClient.getDirectoryClient("dest-dir").getProperties();
      assert.ok(destProps.etag);

      // Verify old path doesn't exist
      try {
        await fsClient.getDirectoryClient("src-dir").getProperties();
        assert.fail("Expected 404 for old directory");
      } catch (error: any) {
        assert.strictEqual(error.statusCode, 404);
      }

      await fsClient.getDirectoryClient("dest-dir").delete(true);
    });
  });

  // ---------------------------------------------------------------------------
  // File operations
  // ---------------------------------------------------------------------------

  describe("File operations", () => {
    let fsClient: DataLakeFileSystemClient;

    beforeEach(async () => {
      fsClient = serviceClient.getFileSystemClient(getUniqueName("sdkfs"));
      await fsClient.create();
    });

    afterEach(async () => {
      await fsClient.delete();
    });

    it("creates an empty file @loki @sql", async () => {
      const fileClient = fsClient.getFileClient("empty-file.txt");
      const createResponse = await fileClient.create();
      assert.strictEqual(createResponse._response.status, 201);

      const props = await fileClient.getProperties();
      assert.ok(props.etag);
      assert.strictEqual(props.contentLength, 0);

      await fileClient.delete();
    });

    it("appends and flushes data, then reads it back @loki @sql", async () => {
      const fileClient = fsClient.getFileClient("data-file.txt");
      await fileClient.create();

      const content = "Hello from the DataLake SDK!";
      const buffer = Buffer.from(content);

      // Append + flush
      await fileClient.append(buffer, 0, buffer.length);
      await fileClient.flush(buffer.length);

      // Read back
      const downloadResponse = await fileClient.read();
      const downloaded = await streamToString(downloadResponse.readableStreamBody!);
      assert.strictEqual(downloaded, content);

      await fileClient.delete();
    });

    it("writes multi-chunk file and reads back @loki @sql", async () => {
      const fileClient = fsClient.getFileClient("multi-chunk.txt");
      await fileClient.create();

      const chunk1 = Buffer.from("First chunk. ");
      const chunk2 = Buffer.from("Second chunk. ");
      const chunk3 = Buffer.from("Third chunk.");

      await fileClient.append(chunk1, 0, chunk1.length);
      await fileClient.append(chunk2, chunk1.length, chunk2.length);
      await fileClient.append(chunk3, chunk1.length + chunk2.length, chunk3.length);
      await fileClient.flush(chunk1.length + chunk2.length + chunk3.length);

      const downloadResponse = await fileClient.read();
      const downloaded = await streamToString(downloadResponse.readableStreamBody!);
      assert.strictEqual(downloaded, "First chunk. Second chunk. Third chunk.");

      await fileClient.delete();
    });

    it("deletes a file @loki @sql", async () => {
      const fileClient = fsClient.getFileClient("to-delete.txt");
      await fileClient.create();

      await fileClient.delete();

      try {
        await fileClient.getProperties();
        assert.fail("Expected 404 after delete");
      } catch (error: any) {
        assert.strictEqual(error.statusCode, 404);
      }
    });

    it("moves (renames) a file @loki @sql", async () => {
      const fileClient = fsClient.getFileClient("original.txt");
      await fileClient.create();

      await fileClient.move("renamed.txt");

      const renamedProps = await fsClient.getFileClient("renamed.txt").getProperties();
      assert.ok(renamedProps.etag);

      try {
        await fsClient.getFileClient("original.txt").getProperties();
        assert.fail("Expected 404 for old file");
      } catch (error: any) {
        assert.strictEqual(error.statusCode, 404);
      }

      await fsClient.getFileClient("renamed.txt").delete();
    });
  });

  // ---------------------------------------------------------------------------
  // ACL operations
  // ---------------------------------------------------------------------------

  describe("ACL operations", () => {
    let fsClient: DataLakeFileSystemClient;

    beforeEach(async () => {
      fsClient = serviceClient.getFileSystemClient(getUniqueName("sdkfs"));
      await fsClient.create();
    });

    afterEach(async () => {
      await fsClient.delete();
    });

    it("sets and gets access control on a file @loki @sql", async () => {
      const fileClient = fsClient.getFileClient("acl-file.txt");
      await fileClient.create();

      await fileClient.setAccessControl(
        [
          { accessControlType: "user", defaultScope: false, entityId: "", permissions: { read: true, write: true, execute: true } },
          { accessControlType: "group", defaultScope: false, entityId: "", permissions: { read: true, write: false, execute: true } },
          { accessControlType: "other", defaultScope: false, entityId: "", permissions: { read: false, write: false, execute: false } }
        ]
      );

      const acl = await fileClient.getAccessControl();
      assert.ok(acl.owner);
      assert.ok(acl.group);
      assert.ok(acl.permissions);

      await fileClient.delete();
    });

    it("sets permissions on a directory @loki @sql", async () => {
      const dirClient = fsClient.getDirectoryClient("acl-dir");
      await dirClient.create();

      await dirClient.setPermissions({
        owner: { read: true, write: true, execute: true },
        group: { read: true, write: false, execute: true },
        other: { read: false, write: false, execute: false },
        stickyBit: false,
        extendedAcls: false
      });

      const acl = await dirClient.getAccessControl();
      assert.ok(acl.permissions);

      await dirClient.delete();
    });
  });

  // ---------------------------------------------------------------------------
  // List paths
  // ---------------------------------------------------------------------------

  describe("List paths", () => {
    let fsClient: DataLakeFileSystemClient;

    beforeEach(async () => {
      fsClient = serviceClient.getFileSystemClient(getUniqueName("sdkfs"));
      await fsClient.create();
    });

    afterEach(async () => {
      await fsClient.delete();
    });

    it("lists paths recursively @loki @sql", async () => {
      await fsClient.getDirectoryClient("dir1").create();
      await fsClient.getFileClient("dir1/file1.txt").create();
      await fsClient.getFileClient("dir1/file2.txt").create();
      await fsClient.getFileClient("root-file.txt").create();

      const paths: string[] = [];
      for await (const path of fsClient.listPaths({ recursive: true })) {
        paths.push(path.name!);
      }

      assert.ok(paths.includes("dir1"), "Expected dir1 in path list");
      assert.ok(paths.includes("dir1/file1.txt"), "Expected dir1/file1.txt");
      assert.ok(paths.includes("dir1/file2.txt"), "Expected dir1/file2.txt");
      assert.ok(paths.includes("root-file.txt"), "Expected root-file.txt");
    });

    it("lists paths non-recursively (directory level) @loki @sql", async () => {
      await fsClient.getDirectoryClient("dir-a").create();
      await fsClient.getFileClient("dir-a/nested.txt").create();
      await fsClient.getFileClient("top-level.txt").create();

      const paths: string[] = [];
      for await (const path of fsClient.listPaths({ recursive: false })) {
        paths.push(path.name!);
      }

      assert.ok(paths.includes("dir-a"), "Expected dir-a in non-recursive list");
      assert.ok(paths.includes("top-level.txt"), "Expected top-level.txt");
      // nested file should NOT appear at top level
      assert.ok(!paths.includes("dir-a/nested.txt"), "dir-a/nested.txt should not appear in non-recursive list");
    });
  });

  // ---------------------------------------------------------------------------
  // Lease operations via SDK
  // ---------------------------------------------------------------------------

  describe("Lease operations", () => {
    let fsClient: DataLakeFileSystemClient;

    beforeEach(async () => {
      fsClient = serviceClient.getFileSystemClient(getUniqueName("sdkfs"));
      await fsClient.create();
    });

    afterEach(async () => {
      await fsClient.delete();
    });

    it("checks lease state on a file @loki @sql", async () => {
      const fileClient = fsClient.getFileClient("lease-file.txt");
      await fileClient.create();

      const props = await fileClient.getProperties();
      assert.strictEqual(props.leaseState, "available");

      await fileClient.delete();
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-API compatibility
  // ---------------------------------------------------------------------------

  describe("Cross-API compatibility", () => {
    let fsClient: DataLakeFileSystemClient;
    let fsName: string;

    beforeEach(async () => {
      fsName = getUniqueName("sdkfs");
      fsClient = serviceClient.getFileSystemClient(fsName);
      await fsClient.create();
    });

    afterEach(async () => {
      await fsClient.delete();
    });

    it("file created via DFS is visible via Blob API @loki @sql", async () => {
      const fileClient = fsClient.getFileClient("cross-api-file.txt");
      await fileClient.create();

      // Append and flush content
      const content = Buffer.from("cross-api content");
      await fileClient.append(content, 0, content.length);
      await fileClient.flush(content.length);

      // Read via Blob API
      const { BlobServiceClient, StorageSharedKeyCredential: BlobCredential } = await import("@azure/storage-blob");
      const blobServiceClient = new BlobServiceClient(
        `http://127.0.0.1:${blobServer.config.port}/${EMULATOR_ACCOUNT_NAME}`,
        new BlobCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
      );
      const containerClient = blobServiceClient.getContainerClient(fsName);
      const blobClient = containerClient.getBlobClient("cross-api-file.txt");
      const downloadResponse = await blobClient.download();
      const downloaded = await streamToString(downloadResponse.readableStreamBody!);
      assert.strictEqual(downloaded, "cross-api content");
    });

    it("blob created via Blob API is visible via DFS @loki @sql", async () => {
      const { BlobServiceClient, StorageSharedKeyCredential: BlobCredential } = await import("@azure/storage-blob");
      const blobServiceClient = new BlobServiceClient(
        `http://127.0.0.1:${blobServer.config.port}/${EMULATOR_ACCOUNT_NAME}`,
        new BlobCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
      );
      const containerClient = blobServiceClient.getContainerClient(fsName);

      // Upload blob via Blob API
      const content = "blob-api content";
      const blockBlobClient = containerClient.getBlockBlobClient("blob-created.txt");
      await blockBlobClient.upload(content, content.length);

      // Read via DFS
      const fileClient = fsClient.getFileClient("blob-created.txt");
      const readResponse = await fileClient.read();
      const downloaded = await streamToString(readResponse.readableStreamBody!);
      assert.strictEqual(downloaded, "blob-api content");
    });
  });
});

// Helper to convert a readable stream to string
async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}
