import assert, { fail } from "assert";
import { count } from "console";

import { BlobServiceClient } from "@azure/storage-blob";
import {
  DataLakeServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";

import { configLogger } from "../../../../src/common/Logger";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../../testutils";
import DataLakeTestServerFactory from "../../DataLakeTestServerFactory";

// Set true to enable debug log
configLogger(false);

describe("DirectoryAndFileApis", () => {
  const factory = new DataLakeTestServerFactory();
  const server = factory.createServer();

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const serviceClient = new DataLakeServiceClient(
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

  const blobServiceClient = new BlobServiceClient(
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

  const fileSytemName: string = getUniqueName("filesystem");
  const fileSystemClient = serviceClient.getFileSystemClient(fileSytemName);
  const parentDirectoryName: string = getUniqueName("parentDirectory");
  const parentDirectoryClient =
    fileSystemClient.getDirectoryClient(parentDirectoryName);
  const chilDirectoryName: string = getUniqueName("childDirectory");
  const childDirectoryClient =
    parentDirectoryClient.getSubdirectoryClient(chilDirectoryName);
  const grandChildDirectoryName = getUniqueName("grandChildDirectory");
  const grandChildDirectoryClient = childDirectoryClient.getSubdirectoryClient(
    grandChildDirectoryName
  );
  const file1Name: string = getUniqueName("file1");
  const file1Client = grandChildDirectoryClient.getFileClient(file1Name);
  const file2Name: string = getUniqueName("file2");
  const file2Client = grandChildDirectoryClient.getFileClient(file2Name);

  let containerClient = blobServiceClient.getContainerClient(fileSytemName);
  let blob1Client = containerClient.getBlobClient(
    `${parentDirectoryName}/${chilDirectoryName}/${grandChildDirectoryName}/${file1Name}`
  );
  let blob2Client = containerClient.getBlobClient(
    `${parentDirectoryName}/${chilDirectoryName}/${grandChildDirectoryName}/${file2Name}`
  );

  const content = "Hello World";

  before(async () => {
    await server.start();
  });

  after(async () => {
    await fileSystemClient.delete();
    await server.close();
    await server.clean();
  });

  it("create directorys @loki @sql", async () => {
    await fileSystemClient.createIfNotExists();
    await parentDirectoryClient.deleteIfExists(true);
    //should create parent as well;
    await grandChildDirectoryClient.create();
    assert.strictEqual(await grandChildDirectoryClient.exists(), true);
    assert.strictEqual(await childDirectoryClient.exists(), true);
    assert.strictEqual(await parentDirectoryClient.exists(), true);
  });

  it("create File (DataLake) @loki @sql", async () => {
    await file1Client.create();
    assert.strictEqual(await file1Client.exists(), true);
    const properties = await file1Client.getProperties();
    assert.strictEqual(properties.contentLength, 0);
    await file1Client.delete();
    assert.strictEqual(await file1Client.exists(), false);
  });

  it("create AppendBlob (Blob) @loki @sql", async () => {
    await blob1Client.getAppendBlobClient().create();
    assert.strictEqual(await blob1Client.exists(), true);
    const properties = await blob1Client.getProperties();
    assert.strictEqual(properties.contentLength, 0);
  });

  it("Append to File (DataLake) @loki @sql", async () => {
    await file1Client.append(content, 0, content.length);
    await file1Client.flush(content.length);
    const properties = await file1Client.getProperties();
    assert.strictEqual(properties.contentLength, content.length);
  });

  it("Append to File (Blob) @loki @sql", async () => {
    await blob1Client
      .getAppendBlobClient()
      .appendBlock(content, content.length);
    const properties = await file1Client.getProperties();
    assert.strictEqual(properties.contentLength, content.length * 2);
  });

  it("Append to Non Existing File should fail (DataLake) @loki @sql", async () => {
    const nonExistingFileClient = grandChildDirectoryClient.getFileClient(
      getUniqueName("non-existing-file")
    );
    let error;
    try {
      await nonExistingFileClient.append(content, 0, content.length);
    } catch (err) {
      error = err;
      assert.strictEqual(err.code, "PathNotFound");
      assert.strictEqual(
        err.message.startsWith("The specified path does not exist."),
        true
      );
    }

    if (!error) fail();
  });

  it("Flush to Non Existing File should fail (DataLake) @loki @sql", async () => {
    const nonExistingFileClient = grandChildDirectoryClient.getFileClient(
      getUniqueName("non-existing-file")
    );
    let error;
    try {
      await nonExistingFileClient.flush(content.length);
    } catch (err) {
      error = err;
      assert.strictEqual(err.code, "PathNotFound");
      assert.strictEqual(
        err.message.startsWith("The specified path does not exist."),
        true
      );
    }

    if (!error) fail();
  });

  it("Append to Non Existing File should fail (Blob) @loki @sql", async () => {
    const nonExistingBlobClient = containerClient.getBlobClient(
      getUniqueName("non-existing-file")
    );
    let error;
    try {
      await nonExistingBlobClient
        .getAppendBlobClient()
        .appendBlock(content, content.length);
    } catch (err) {
      error = err;
      assert.strictEqual(err.code, "BlobNotFound");
      assert.strictEqual(
        err.message.startsWith("The specified blob does not exist."),
        true
      );
    }

    if (!error) fail();
  });

  it("Read File (DataLake) @loki @sql", async () => {
    const readContent = await file1Client.readToBuffer(0, count.length * 2);
    assert.deepStrictEqual(readContent, Buffer.from(content + content));
  });

  it("Read File (Blob) @loki @sql", async () => {
    const readContent = await blob1Client.downloadToBuffer(0, count.length * 2);
    assert.deepStrictEqual(readContent, Buffer.from(content + content));
  });

  it("Copy File (DataLake) [Read Then upload no direct copy] @loki @sql", async () => {
    assert.strictEqual(await file1Client.exists(), true);
    assert.strictEqual(await file2Client.exists(), false);
    const readResponse = await file1Client.read();
    const readContent = await bodyToString(readResponse);
    await file2Client.create();
    await file2Client.append(readContent, 0, readContent.length, {
      flush: true
    });
    assert.strictEqual(await file1Client.exists(), true);
    assert.strictEqual(await file2Client.exists(), true);
    const writtenResponse = await file2Client.read();
    const writtenContent = await bodyToString(writtenResponse);
    assert.deepStrictEqual(readContent, writtenContent);
    await file2Client.delete();
  });

  it("Copy File (Blob) @loki @sql", async () => {
    assert.strictEqual(await blob1Client.exists(), true);
    assert.strictEqual(await blob2Client.exists(), false);
    await blob2Client.syncCopyFromURL(blob1Client.url);
    assert.strictEqual(await blob1Client.exists(), true);
    assert.strictEqual(await blob2Client.exists(), true);
    const result1 = await blob1Client.download();
    const result2 = await blob2Client.download();
    const readContent1 = await bodyToString(result1);
    const readContent2 = await bodyToString(result2);
    assert.deepStrictEqual(readContent1, readContent2);
  });

  it.skip("Move/Rename Directory [in azure-data-lake current version only works with production style url, in normal mode it doesn't send account name in url] (DataLake) @loki @sql", async () => {
    const destDirClient = parentDirectoryClient.getSubdirectoryClient(
      getUniqueName("sourcedir")
    );
    assert.strictEqual(await childDirectoryClient.exists(), true);
    assert.strictEqual(await destDirClient.exists(), false);
    await childDirectoryClient.move(destDirClient.name);
    assert.strictEqual(await childDirectoryClient.exists(), false);
    assert.strictEqual(await grandChildDirectoryClient.exists(), false);
    assert.strictEqual(await file1Client.exists(), false);
    assert.strictEqual(await file2Client.exists(), false);
    assert.strictEqual(await destDirClient.exists(), true);
    await destDirClient.move(childDirectoryClient.name);
    assert.strictEqual(await childDirectoryClient.exists(), true);
    assert.strictEqual(await grandChildDirectoryClient.exists(), true);
    assert.strictEqual(await file1Client.exists(), true);
    assert.strictEqual(await file2Client.exists(), true);
    assert.strictEqual(await destDirClient.exists(), false);
  });

  it("Append then read should return empty withoutflush (DataLake) @loki @sql", async () => {
    await file1Client.deleteIfExists();
    assert.strictEqual(await file1Client.exists(), false);
    await file1Client.create();
    assert.strictEqual(await file1Client.exists(), true);
    await file1Client.append(content, 0, content.length);
    let readResponse = await file1Client.read();
    let readContent = await bodyToString(readResponse);
    assert.strictEqual(readContent.length, 0);
    await file1Client.append(content, 0, content.length);
    assert.strictEqual(readContent.length, 0);
    await file1Client.flush(content.length * 2);
    readResponse = await file1Client.read();
    readContent = await bodyToString(readResponse);
    assert.deepStrictEqual(readContent, content + content);
  });
});
