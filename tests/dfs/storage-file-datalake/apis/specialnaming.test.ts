// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import assert from "assert";
import { Context } from "mocha";

import {
  DataLakeFileClient,
  DataLakeFileSystemClient,
  DataLakeServiceClient,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";

import { configLogger } from "../../../../src/common/Logger";
import {
  appendToURLPath,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../../testutils";
import DataLakeTestServerFactory from "../../DataLakeTestServerFactory";

// Set true to enable debug log
configLogger(false);

describe("Special Naming Tests", () => {
  const factory = new DataLakeTestServerFactory();
  const server = factory.createServer();

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

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  beforeEach(async function (this: Context) {
    fileSystemName = getUniqueName("1container-with-dash");
    fileSystemClient = serviceClient.getFileSystemClient(fileSystemName);
    await fileSystemClient.createIfNotExists();
  });

  afterEach(async function () {
    await fileSystemClient.deleteIfExists();
  });

  it("Should work with special container and blob names with spaces @loki @sql", async () => {
    const fileName: string = getUniqueName("blob empty");
    const fileClient = fileSystemClient.getFileClient(fileName);

    await fileClient.create();
    const response = (await fileSystemClient.listPaths().byPage().next()).value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special container and blob names with spaces in URL string @loki @sql", async () => {
    const fileName: string = getUniqueName("blob empty");
    const fileClient = new DataLakeFileClient(
      appendToURLPath(fileSystemClient.url, fileName),
      (fileSystemClient as any).pipeline
    );

    await fileClient.create();
    const response = (await fileSystemClient.listPaths().byPage().next()).value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special container and blob names uppercase @loki @sql", async () => {
    const fileName: string = getUniqueName("Upper blob empty another");
    const fileClient = fileSystemClient.getFileClient(fileName);

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special container and blob names uppercase in URL string @loki @sql", async () => {
    const fileName: string = getUniqueName("Upper blob empty another");
    const fileClient = new DataLakeFileClient(
      appendToURLPath(fileSystemClient.url, fileName),
      (fileSystemClient as any).pipeline
    );

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special blob names Chinese characters @loki @sql", async () => {
    const fileName: string = getUniqueName("Upper blob empty another 汉字");
    const fileClient = fileSystemClient.getFileClient(fileName);

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special blob names Chinese characters in URL string @loki @sql", async () => {
    const fileName: string = getUniqueName("Upper blob empty another 汉字");
    const fileClient = new DataLakeFileClient(
      appendToURLPath(fileSystemClient.url, fileName),
      (fileSystemClient as any).pipeline
    );

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special blob name characters @loki @sql", async () => {
    const specialName =
      "汉字. special ~!@#$%^&*()_+`1234567890-={}|[]:\";'<>?,'";
    const fileName: string = getUniqueName(specialName);
    const fileClient = fileSystemClient.getFileClient(fileName);

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special blob name characters in URL string @loki @sql", async () => {
    const specialName =
      "汉字. special ~!@#$%^&*()_+`1234567890-={}|[]:\";'<>?,'";
    const fileName: string = getUniqueName(specialName);
    const fileClient = new DataLakeFileClient(
      // There are 2 special cases for a URL string:
      // Escape "%" when creating XxxClient object with URL strings
      // Escape "?" otherwise string after "?" will be treated as URL parameters
      appendToURLPath(
        fileSystemClient.url,
        fileName.replace(/%/g, "%25").replace(/\?/g, "%3F")
      ),
      (fileSystemClient as any).pipeline
    );

    await fileClient.create();
    await fileClient.getProperties();
    const response = (
      await fileSystemClient
        .listPaths({
          // NOTICE: Azure Storage Server will replace "\" with "/" in the blob names
          // .replace(/\\/g, "/")
        })
        .byPage()
        .next()
    ).value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special blob name Russian URI encoded @loki @sql", async () => {
    const fileName: string = getUniqueName("ру́сский язы́к");
    const fileNameEncoded: string = encodeURIComponent(fileName);
    const fileClient = fileSystemClient.getFileClient(fileNameEncoded);

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileNameEncoded);
  });

  it("Should work with special blob name Russian @loki @sql", async () => {
    const fileName: string = getUniqueName("ру́сский язы́к");
    const fileClient = fileSystemClient.getFileClient(fileName);

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special blob name Russian in URL string @loki @sql", async () => {
    const fileName: string = getUniqueName("ру́сский язы́к");
    const fileClient = new DataLakeFileClient(
      appendToURLPath(fileSystemClient.url, fileName),
      (fileSystemClient as any).pipeline
    );

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special blob name Arabic URI encoded @loki @sql", async () => {
    const fileName: string = getUniqueName("عربيعربى");
    const fileNameEncoded: string = encodeURIComponent(fileName);
    const fileClient = fileSystemClient.getFileClient(fileNameEncoded);

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileNameEncoded);
  });

  it("Should work with special blob name Arabic @loki @sql", async () => {
    const fileName: string = getUniqueName("عربيعربى");
    const fileClient = fileSystemClient.getFileClient(fileName);

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special blob name Arabic in URL string @loki @sql", async () => {
    const fileName: string = getUniqueName("عربيعربى");
    const fileClient = new DataLakeFileClient(
      appendToURLPath(fileSystemClient.url, fileName),
      (fileSystemClient as any).pipeline
    );

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special blob name Japanese URI encoded @loki @sql", async () => {
    const fileName: string = getUniqueName("にっぽんごにほんご");
    const fileNameEncoded: string = encodeURIComponent(fileName);
    const fileClient = fileSystemClient.getFileClient(fileNameEncoded);

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileNameEncoded);
  });

  it("Should work with special blob name Japanese @loki @sql", async () => {
    const fileName: string = getUniqueName("にっぽんごにほんご");
    const fileClient = fileSystemClient.getFileClient(fileName);

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });

  it("Should work with special blob name Japanese in URL string @loki @sql", async () => {
    const fileName: string = getUniqueName("にっぽんごにほんご");
    const fileClient = new DataLakeFileClient(
      appendToURLPath(fileSystemClient.url, fileName),
      (fileSystemClient as any).pipeline
    );

    await fileClient.create();
    await fileClient.getProperties();
    const response = (await fileSystemClient.listPaths({}).byPage().next())
      .value;

    assert.deepStrictEqual(response.pathItems.length, 1);
    assert.deepStrictEqual(response.pathItems[0].name, fileName);
  });
});
