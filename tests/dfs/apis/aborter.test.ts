// Copyright (c) Microsoft Corporation.
import assert from "assert";
import { Context } from "mocha";

// Licensed under the MIT license.
import { AbortController, AbortSignal } from "@azure/abort-controller";
import {
  DataLakeFileSystemClient,
  DataLakeServiceClient,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";

import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";
import BlobTestServerFactory from "../../BlobTestServerFactory";

describe("Aborter", () => {
  const factory = new BlobTestServerFactory(true);
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
    checkIfShouldSkip(this);
    fileSystemName = getUniqueName("filesystem");
    fileSystemClient = serviceClient.getFileSystemClient(fileSystemName);
  });

  afterEach(async function () {
    await fileSystemClient.deleteIfExists();
  });

  it("Should abort after aborter timeout @loki @sql", async () => {
    try {
      await fileSystemClient.create({
        abortSignal: AbortController.timeout(1)
      });
      assert.fail();
    } catch (err: any) {
      assert.equal(err.name, "AbortError");
    }
  });

  it("Should not abort after calling abort() @loki @sql", async () => {
    await fileSystemClient.create({ abortSignal: AbortSignal.none });
  });

  it("Should abort when calling abort() before request finishes @loki @sql", async () => {
    const aborter = new AbortController();
    const response = fileSystemClient.create({ abortSignal: aborter.signal });
    aborter.abort();
    try {
      await response;
      assert.fail();
    } catch (err: any) {
      assert.equal(err.name, "AbortError");
    }
  });

  it("Should not abort when calling abort() after request finishes @loki @sql", async () => {
    const aborter = new AbortController();
    await fileSystemClient.create({ abortSignal: aborter.signal });
    aborter.abort();
  });

  it("Should abort after father aborter calls abort() @loki @sql", async () => {
    try {
      const aborter = new AbortController();
      const childAborter = new AbortController(
        aborter.signal,
        AbortController.timeout(10 * 60 * 1000)
      );
      const response = fileSystemClient.create({
        abortSignal: childAborter.signal
      });
      aborter.abort();
      await response;
      assert.fail();
    } catch (err: any) {
      assert.equal(err.name, "AbortError");
    }
  });
});

function checkIfShouldSkip(context: Context) {
  if (
    context.currentTest!.title.indexOf("ExpiryTime") > -1 ||
    context.test!.parent!.title.indexOf("soft delete") > -1
  ) {
    context.skip();
  }
}
