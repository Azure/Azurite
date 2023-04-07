// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import assert from "assert";
import os from "os";
import {
  DataLakeDirectoryClient,
  DataLakeFileClient,
  DataLakeFileSystemClient,
  DataLakeServiceClient,
  FileSystemListPathsResponse,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";

import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";
import DataLakeTestServerFactory from "../DataLakeTestServerFactory";

describe("Bugs", () => {
  const factory = new DataLakeTestServerFactory();
  const server = factory.createServer(true);

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const serviceClient = new DataLakeServiceClient(
    baseURL,
    new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
    {
      retryOptions: { maxTries: 1 },
      // Make sure socket is closed once the operation is done.
      keepAliveOptions: { enable: false }
    }
  );

  let fileSystemName: string;
  let fileSystemClient: DataLakeFileSystemClient;
  let fileName: string;
  let fileClient: DataLakeFileClient;
  let directoryName: string;
  let directoryClient: DataLakeDirectoryClient;
  const content = "Hello World";

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  beforeEach(async function () {
    fileSystemName = getUniqueName("filesystem");
    fileSystemClient = serviceClient.getFileSystemClient(fileSystemName);
    await fileSystemClient.createIfNotExists();
    directoryName = getUniqueName("directory");
    directoryClient = fileSystemClient.getDirectoryClient(directoryName);
    await directoryClient.create();
    fileName = getUniqueName("file");
    fileClient = fileSystemClient.getFileClient(fileName);
    await fileClient.create();
    await fileClient.append(content, 0, content.length);
    await fileClient.flush(content.length);
  });

  afterEach(async function () {
    await fileSystemClient.deleteIfExists();
  });

  it("listPaths should work on root @loki @sql", async () => {
    await fileSystemClient
      .getDirectoryClient(getUniqueName("directory"))
      .create();
    await fileSystemClient
      .getDirectoryClient(getUniqueName("directory"))
      .create();
    await fileSystemClient
      .getDirectoryClient(getUniqueName("directory"))
      .create();
    await fileSystemClient.getFileClient(getUniqueName("file")).create();

    const response = (await fileSystemClient.listPaths().byPage().next())
      .value as FileSystemListPathsResponse;

    assert.strictEqual(response.pathItems?.length, 6);
  });

  it("listPaths should not include folders/files with same prefix @loki @sql", async () => {
    await fileSystemClient.getDirectoryClient("abc").create();
    await fileSystemClient.getDirectoryClient("abc123").create();
    await fileSystemClient.getDirectoryClient("abc1234").create();
    await fileSystemClient.getFileClient("abc1").create();
    await fileSystemClient.getFileClient("abc12").create();

    const response = (
      await fileSystemClient.listPaths({ path: "abc" }).byPage().next()
    ).value as FileSystemListPathsResponse;

    assert.strictEqual(response.pathItems?.length, 0);
  });

  it("recursive delete should not delete folders/files with same prefix @loki @sql", async () => {
    const directoryClient = fileSystemClient.getDirectoryClient("abc");
    await directoryClient.create();
    const directoryClient2 = fileSystemClient.getDirectoryClient("abc123");
    const directoryClient3 = fileSystemClient.getDirectoryClient("abc1234");
    const fileClient1 = fileSystemClient.getFileClient("abc1");
    const fileClient2 = fileSystemClient.getFileClient("abc2");
    await directoryClient2.create();
    await directoryClient3.create();
    await fileClient1.create();
    await fileClient2.create();
    await directoryClient.delete(true);
    assert.strictEqual(await directoryClient2.exists(), true);
    assert.strictEqual(await directoryClient3.exists(), true);
    assert.strictEqual(await fileClient1.exists(), true);
    assert.strictEqual(await fileClient2.exists(), true);
  });

  it("multiple append/flush should not overwrite each other @loki @sql", async () => {
    await fileClient.create();
    const len = content.length;
    await fileClient.append(content, 0, len, { flush: true });
    await fileClient.append(content, len, len, { flush: true });
    await fileClient.append(content, len * 2, len, { flush: true });
    const response = await fileClient.getProperties();
    assert.strictEqual(response.contentLength, len * 3);
    const readResponse = await fileClient.read();
    const read = await bodyToString(readResponse);
    assert.strictEqual(read, content + content + content);
  });

  it("file should have default access control @loki @sql", async () => {
    assert.ok((await fileClient.getAccessControl()).acl);
    assert.ok((await fileClient.getAccessControl()).permissions);
    assert.ok((await fileClient.getAccessControl()).owner);
    if (os.platform() !== "win32") {
      assert.ok((await fileClient.getAccessControl()).group);
    }
  });

  it("directory should have default access control @loki @sql", async () => {
    assert.ok((await directoryClient.getAccessControl()).acl);
    assert.ok((await directoryClient.getAccessControl()).permissions);
    assert.ok((await directoryClient.getAccessControl()).owner);
    if (os.platform() !== "win32") {
      assert.ok((await directoryClient.getAccessControl()).group);
    }
  });
});
