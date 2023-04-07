// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Context } from "mocha";

import { TokenCredential } from "@azure/core-auth";
import {
  DataLakeFileSystemClient,
  DataLakeServiceClient,
  FileSystemSASPermissions,
  newPipeline,
  PublicAccessType,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";

import {
  assertClientUsesTokenCredential,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../../testutils";
import DataLakeTestServerFactory from "../../DataLakeTestServerFactory";

import assert = require("assert");

describe("DataLakeFileSystemClient Node.js only", () => {
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
    fileSystemName = getUniqueName("filesystem");
    fileSystemClient = serviceClient.getFileSystemClient(fileSystemName);
    await fileSystemClient.createIfNotExists();
  });

  afterEach(async function () {
    await fileSystemClient.deleteIfExists();
  });

  it("getAccessPolicy @loki @sql", async () => {
    const result = await fileSystemClient.getAccessPolicy();
    assert.ok(result.etag!.length > 0);
    assert.ok(result.lastModified);
    assert.ok(result.requestId);
    assert.ok(result.clientRequestId);
    assert.ok(result.version);
    assert.ok(result.date);
  });

  it("setAccessPolicy @loki @sql", async () => {
    const access: PublicAccessType = "file";
    const acl = [
      {
        accessPolicy: {
          expiresOn: new Date("2018-12-31T11:22:33.4567890Z"),
          permissions: FileSystemSASPermissions.parse("rwd").toString(),
          startsOn: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      }
    ];

    await fileSystemClient.setAccessPolicy(access, acl);
    const result = await fileSystemClient.getAccessPolicy();
    assert.deepEqual(result.signedIdentifiers, acl);
    assert.deepEqual(result.publicAccess, access);
  });

  it("setAccessPolicy should work when expiry and start undefined @loki @sql", async () => {
    const access: PublicAccessType = "file";
    const acl = [
      {
        accessPolicy: {
          permissions: FileSystemSASPermissions.parse("rwd").toString()
        },
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      }
    ];

    await fileSystemClient.setAccessPolicy(access, acl);
    const result = await fileSystemClient.getAccessPolicy();
    assert.deepEqual(result.signedIdentifiers, acl);
    assert.deepEqual(result.publicAccess, access);
  });

  it("can be created with a url and a credential @loki @sql", async () => {
    const credential = fileSystemClient.credential;
    const newClient = new DataLakeFileSystemClient(
      fileSystemClient.url,
      credential
    );
    const result = await newClient.getProperties();

    assert.ok(result.etag!.length > 0);
    assert.ok(result.lastModified);
    assert.ok(!result.leaseDuration);
    assert.equal(result.leaseState, "available");
    assert.equal(result.leaseStatus, "unlocked");
    assert.ok(result.requestId);
    assert.ok(result.version);
    assert.ok(result.date);
    assert.ok(!result.publicAccess);
  });

  it("can be created with a url and a credential and an option bag @loki @sql", async () => {
    const credential = fileSystemClient.credential;
    const newClient = new DataLakeFileSystemClient(
      fileSystemClient.url,
      credential,
      {
        retryOptions: {
          maxTries: 5
        }
      }
    );

    const result = await newClient.getProperties();

    assert.ok(result.etag!.length > 0);
    assert.ok(result.lastModified);
    assert.ok(!result.leaseDuration);
    assert.equal(result.leaseState, "available");
    assert.equal(result.leaseStatus, "unlocked");
    assert.ok(result.requestId);
    assert.ok(result.version);
    assert.ok(result.date);
    assert.ok(!result.publicAccess);
  });

  it("can be created with a url and a TokenCredential @loki @sql", async () => {
    const tokenCredential: TokenCredential = {
      getToken: () =>
        Promise.resolve({
          token: "token",
          expiresOnTimestamp: 12345
        })
    };
    const newClient = new DataLakeFileSystemClient(
      fileSystemClient.url,
      tokenCredential
    );
    assertClientUsesTokenCredential(newClient);
  });

  it("can be created with a url and a pipeline @loki @sql", async () => {
    const credential = fileSystemClient.credential;
    const pipeline = newPipeline(credential);
    const newClient = new DataLakeFileSystemClient(
      fileSystemClient.url,
      pipeline
    );

    const result = await newClient.getProperties();

    assert.ok(result.etag!.length > 0);
    assert.ok(result.lastModified);
    assert.ok(!result.leaseDuration);
    assert.equal(result.leaseState, "available");
    assert.equal(result.leaseStatus, "unlocked");
    assert.ok(result.requestId);
    assert.ok(result.version);
    assert.ok(result.date);
    assert.ok(!result.publicAccess);
  });
});
