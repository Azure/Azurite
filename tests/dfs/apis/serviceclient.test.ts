// Copyright (c) Microsoft Corporation.
import assert from "assert";
import { Context } from "mocha";

import { delay } from "@azure/ms-rest-js";
// Licensed under the MIT license.
import {
  DataLakeServiceClient,
  DataLakeServiceProperties,
  FileSystemItem,
  ServiceListFileSystemsSegmentResponse,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";

import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getEncryptionScope,
  getUniqueName,
  getYieldedValue
} from "../../testutils";
import BlobTestServerFactory from "../../BlobTestServerFactory";

describe("DataLakeServiceClient", () => {
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

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  beforeEach(async function (this: Context) {
    shouldSkip(this);
  });

  it("SetProperties and GetProperties @loki @sql", async () => {
    const previousProperties = await serviceClient.getProperties();

    let serviceProperties: DataLakeServiceProperties;

    // Need to determine serviceProperties's type before assigning.
    /* eslint-disable-next-line prefer-const */
    serviceProperties = {
      blobAnalyticsLogging: {
        deleteProperty: true,
        read: true,
        retentionPolicy: {
          days: 5,
          enabled: true
        },
        version: "1.0",
        write: true
      },
      minuteMetrics: {
        enabled: true,
        includeAPIs: true,
        retentionPolicy: {
          days: 4,
          enabled: true
        },
        version: "1.0"
      },
      hourMetrics: {
        enabled: true,
        includeAPIs: true,
        retentionPolicy: {
          days: 3,
          enabled: true
        },
        version: "1.0"
      },
      deleteRetentionPolicy: {
        days: 2,
        enabled: true
      }
    };

    await serviceClient.setProperties(serviceProperties);
    await delay(5 * 1000);

    let properties = await serviceClient.getProperties();
    assert.deepStrictEqual(
      serviceProperties.blobAnalyticsLogging,
      properties.blobAnalyticsLogging
    );
    assert.deepStrictEqual(
      serviceProperties.hourMetrics,
      properties.hourMetrics
    );
    assert.deepStrictEqual(
      serviceProperties.minuteMetrics,
      properties.minuteMetrics
    );
    assert.deepStrictEqual(
      serviceProperties.deleteRetentionPolicy?.days,
      properties.deleteRetentionPolicy?.days
    );
    assert.deepStrictEqual(
      serviceProperties.deleteRetentionPolicy?.enabled,
      properties.deleteRetentionPolicy?.enabled
    );

    // Cleanup
    await serviceClient.setProperties(previousProperties);
    await delay(5 * 1000);

    properties = await serviceClient.getProperties();
    if (previousProperties.cors !== undefined) {
      assert.deepStrictEqual(previousProperties.cors, properties.cors);
    }

    if (previousProperties.blobAnalyticsLogging !== undefined) {
      assert.deepStrictEqual(
        previousProperties.blobAnalyticsLogging,
        properties.blobAnalyticsLogging
      );
    }

    if (previousProperties.hourMetrics !== undefined) {
      assert.deepStrictEqual(
        previousProperties.hourMetrics,
        properties.hourMetrics
      );
    }

    if (previousProperties.minuteMetrics !== undefined) {
      assert.deepStrictEqual(
        previousProperties.minuteMetrics,
        properties.minuteMetrics
      );
    }

    if (previousProperties.deleteRetentionPolicy?.days !== undefined) {
      assert.deepStrictEqual(
        previousProperties.deleteRetentionPolicy?.days,
        properties.deleteRetentionPolicy?.days
      );
    }

    if (previousProperties.deleteRetentionPolicy?.enabled !== undefined) {
      assert.deepStrictEqual(
        previousProperties.deleteRetentionPolicy?.enabled,
        properties.deleteRetentionPolicy?.enabled
      );
    }
  });

  it("ListFileSystems with default parameters @loki @sql", async () => {
    const result = (await serviceClient.listFileSystems().byPage().next())
      .value as ServiceListFileSystemsSegmentResponse;
    assert.ok(typeof result.requestId);
    assert.ok(result.requestId!.length > 0);
    assert.ok(typeof result.version);
    assert.ok(result.version!.length > 0);
    assert.ok(typeof result.clientRequestId);
    assert.ok(result.clientRequestId!.length > 0);

    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(result.fileSystemItems.length >= 0);

    if (result.fileSystemItems.length > 0) {
      const filesystem = result.fileSystemItems[0];
      assert.ok(filesystem.name.length > 0);
      assert.ok(filesystem.properties.etag.length > 0);
      assert.ok(filesystem.properties.lastModified);
    }
  });

  it("ListFileSystems - returns file system encryption scope info @loki @sql", async function (this: Context) {
    let encryptionScopeName: string | undefined;
    try {
      encryptionScopeName = getEncryptionScope();
    } catch {
      this.skip();
    }

    const fileSystemName = getUniqueName("filesystem");
    const cClient = serviceClient.getFileSystemClient(fileSystemName);
    await cClient.create({
      fileSystemEncryptionScope: {
        defaultEncryptionScope: encryptionScopeName,
        preventEncryptionScopeOverride: true
      }
    });

    const result = (await serviceClient.listFileSystems().byPage().next())
      .value;
    assert.ok(result.fileSystemItems.length >= 0);

    let foundTheOne = false;
    result.fileSystemItems.forEach((element: FileSystemItem) => {
      if (element.name === fileSystemName) {
        foundTheOne = true;
        assert.equal(
          element.properties.defaultEncryptionScope,
          encryptionScopeName
        );
      }
    });

    assert.ok(foundTheOne, "Should have found the created file system");
    await cClient.delete();
  });

  it("ListFileSystems - PagedAsyncIterableIterator returns file system encryption scope info @loki @sql", async function (this: Context) {
    let encryptionScopeName: string | undefined;
    try {
      encryptionScopeName = getEncryptionScope();
    } catch {
      this.skip();
    }

    const fileSystemName = getUniqueName("filesystem");
    const cClient = serviceClient.getFileSystemClient(fileSystemName);
    await cClient.create({
      fileSystemEncryptionScope: {
        defaultEncryptionScope: encryptionScopeName,
        preventEncryptionScopeOverride: true
      }
    });

    let foundTheOne = false;

    for await (const filesystem of serviceClient.listFileSystems()) {
      if (filesystem.name === fileSystemName) {
        foundTheOne = true;
        assert.equal(
          filesystem.properties.defaultEncryptionScope,
          encryptionScopeName
        );
      }
    }

    assert.ok(foundTheOne, "Should have found the created file system");
    await cClient.delete();
  });

  it("ListFileSystems with default parameters - null prefix shouldn't throw error @loki @sql", async () => {
    const result = (
      await serviceClient.listFileSystems({ prefix: "" }).byPage().next()
    ).value;

    assert.ok(result.fileSystemItems.length >= 0);

    if (result.fileSystemItems.length > 0) {
      const filesystem = result.fileSystemItems[0];
      assert.ok(filesystem.name.length > 0);
      assert.ok(filesystem.properties.etag.length > 0);
      assert.ok(filesystem.properties.lastModified);
    }
  });

  it("ListFileSystems with all parameters configured @loki @sql", async function (this: Context) {
    const fileSystemNamePrefix = getUniqueName("filesystem1");
    const fileSystemName1 = `${fileSystemNamePrefix}x1`;
    const fileSystemName2 = `${fileSystemNamePrefix}x2`;
    const fileSystemClient1 =
      serviceClient.getFileSystemClient(fileSystemName1);
    const fileSystemClient2 =
      serviceClient.getFileSystemClient(fileSystemName2);
    await fileSystemClient1.create({ metadata: { key: "val" } });
    await fileSystemClient2.create({ metadata: { key: "val" } });

    const result1 = (
      await serviceClient
        .listFileSystems({
          includeMetadata: true,
          prefix: fileSystemNamePrefix
        })
        .byPage({ maxPageSize: 1 })
        .next()
    ).value as ServiceListFileSystemsSegmentResponse; // TODO: Why no intelligence?

    assert.ok(result1.continuationToken);
    assert.equal(result1.fileSystemItems.length, 1);
    assert.ok(result1.fileSystemItems[0].name.startsWith(fileSystemNamePrefix));
    assert.ok(result1.fileSystemItems[0].properties.etag.length > 0);
    assert.ok(result1.fileSystemItems[0].properties.lastModified);
    assert.ok(!result1.fileSystemItems[0].properties.leaseDuration);
    assert.ok(!result1.fileSystemItems[0].properties.publicAccess);
    assert.deepEqual(
      result1.fileSystemItems[0].properties.leaseState,
      "available"
    );
    assert.deepEqual(
      result1.fileSystemItems[0].properties.leaseStatus,
      "unlocked"
    );
    assert.deepEqual(result1.fileSystemItems[0].metadata!.key, "val");

    const result2 = (
      await serviceClient
        .listFileSystems({
          includeMetadata: true,
          prefix: fileSystemNamePrefix
        })
        .byPage({
          continuationToken: result1.continuationToken,
          maxPageSize: 1
        })
        .next()
    ).value as ServiceListFileSystemsSegmentResponse;

    assert.ok(!result2.continuationToken);
    assert.equal(result2.fileSystemItems.length, 1);
    assert.ok(result2.fileSystemItems[0].name.startsWith(fileSystemNamePrefix));
    assert.ok(result2.fileSystemItems[0].properties.etag.length > 0);
    assert.ok(result2.fileSystemItems[0].properties.lastModified);
    assert.ok(!result2.fileSystemItems[0].properties.leaseDuration);
    assert.ok(!result2.fileSystemItems[0].properties.publicAccess);
    assert.deepEqual(
      result2.fileSystemItems[0].properties.leaseState,
      "available"
    );
    assert.deepEqual(
      result2.fileSystemItems[0].properties.leaseStatus,
      "unlocked"
    );
    assert.deepEqual(result2.fileSystemItems[0].metadata!.key, "val");

    await fileSystemClient1.deleteIfExists();
    await fileSystemClient2.deleteIfExists();
  });

  it("Verify PagedAsyncIterableIterator for ListFileSystems @loki @sql", async () => {
    const fileSystemClients = [];
    const fileSystemNamePrefix = getUniqueName("filesystem2");

    for (let i = 0; i < 4; i++) {
      const fileSystemName = `${fileSystemNamePrefix}x${i}`;
      const fileSystemClient =
        serviceClient.getFileSystemClient(fileSystemName);
      await fileSystemClient.create({ metadata: { key: "val" } });
      fileSystemClients.push(fileSystemClient);
    }

    for await (const filesystem of serviceClient.listFileSystems({
      includeMetadata: true,
      prefix: fileSystemNamePrefix
    })) {
      assert.ok(filesystem.name.startsWith(fileSystemNamePrefix));
      assert.ok(filesystem.properties.etag.length > 0);
      assert.ok(filesystem.properties.lastModified);
      assert.ok(!filesystem.properties.leaseDuration);
      assert.ok(!filesystem.properties.publicAccess);
      assert.deepEqual(filesystem.properties.leaseState, "available");
      assert.deepEqual(filesystem.properties.leaseStatus, "unlocked");
      assert.deepEqual(filesystem.metadata!.key, "val");
    }

    for (const client of fileSystemClients) {
      await client.deleteIfExists();
    }
  });

  it("Verify PagedAsyncIterableIterator(generator .next() syntax) for ListFileSystems @loki @sql", async () => {
    const fileSystemNamePrefix = getUniqueName("filesystem3");
    const fileSystemName1 = `${fileSystemNamePrefix}x1`;
    const fileSystemName2 = `${fileSystemNamePrefix}x2`;
    const fileSystemClient1 =
      serviceClient.getFileSystemClient(fileSystemName1);
    const fileSystemClient2 =
      serviceClient.getFileSystemClient(fileSystemName2);
    await fileSystemClient1.create({ metadata: { key: "val" } });
    await fileSystemClient2.create({ metadata: { key: "val" } });

    const iterator = serviceClient.listFileSystems({
      includeMetadata: true,
      prefix: fileSystemNamePrefix
    });

    let fileSystemItem = getYieldedValue(await iterator.next());
    assert.ok(fileSystemItem.name.startsWith(fileSystemNamePrefix));
    assert.ok(fileSystemItem.properties.etag.length > 0);
    assert.ok(fileSystemItem.properties.lastModified);
    assert.ok(!fileSystemItem.properties.leaseDuration);
    assert.ok(!fileSystemItem.properties.publicAccess);
    assert.deepEqual(fileSystemItem.properties.leaseState, "available");
    assert.deepEqual(fileSystemItem.properties.leaseStatus, "unlocked");
    assert.deepEqual(fileSystemItem.metadata!.key, "val");

    fileSystemItem = getYieldedValue(await iterator.next());
    assert.ok(fileSystemItem.name.startsWith(fileSystemNamePrefix));
    assert.ok(fileSystemItem.properties.etag.length > 0);
    assert.ok(fileSystemItem.properties.lastModified);
    assert.ok(!fileSystemItem.properties.leaseDuration);
    assert.ok(!fileSystemItem.properties.publicAccess);
    assert.deepEqual(fileSystemItem.properties.leaseState, "available");
    assert.deepEqual(fileSystemItem.properties.leaseStatus, "unlocked");
    assert.deepEqual(fileSystemItem.metadata!.key, "val");

    await fileSystemClient1.deleteIfExists();
    await fileSystemClient2.deleteIfExists();
  });

  it("Verify PagedAsyncIterableIterator(byPage()) for ListFileSystems @loki @sql", async function (this: Context) {
    const fileSystemClients = [];
    const fileSystemNamePrefix = getUniqueName("filesystem4");

    for (let i = 0; i < 4; i++) {
      const fileSystemName = `${fileSystemNamePrefix}x${i}`;
      const fileSystemClient =
        serviceClient.getFileSystemClient(fileSystemName);
      await fileSystemClient.create({ metadata: { key: "val" } });
      fileSystemClients.push(fileSystemClient);
    }

    for await (const response of serviceClient
      .listFileSystems({
        includeMetadata: true,
        prefix: fileSystemNamePrefix
      })
      .byPage({ maxPageSize: 2 })) {
      for (const filesystem of response.fileSystemItems) {
        assert.ok(filesystem.name.startsWith(fileSystemNamePrefix));
        assert.ok(filesystem.properties.etag.length > 0);
        assert.ok(filesystem.properties.lastModified);
        assert.ok(!filesystem.properties.leaseDuration);
        assert.ok(!filesystem.properties.publicAccess);
        assert.deepEqual(filesystem.properties.leaseState, "available");
        assert.deepEqual(filesystem.properties.leaseStatus, "unlocked");
        assert.deepEqual(filesystem.metadata!.key, "val");
      }
    }

    for (const client of fileSystemClients) {
      await client.deleteIfExists();
    }
  });

  it("Verify PagedAsyncIterableIterator(byPage() - continuationToken) for ListFileSystems @loki @sql", async function (this: Context) {
    const fileSystemClients = [];
    const fileSystemNamePrefix = getUniqueName("filesystem5");

    for (let i = 0; i < 4; i++) {
      const fileSystemName = `${fileSystemNamePrefix}x${i}`;
      const fileSystemClient =
        serviceClient.getFileSystemClient(fileSystemName);
      await fileSystemClient.create({ metadata: { key: "val" } });
      fileSystemClients.push(fileSystemClient);
    }

    let iter = serviceClient
      .listFileSystems({
        includeMetadata: true,
        prefix: fileSystemNamePrefix
      })
      .byPage({ maxPageSize: 2 });
    let response = (await iter.next()).value;
    for (const filesystem of response.fileSystemItems) {
      assert.ok(filesystem.name.startsWith(fileSystemNamePrefix));
      assert.ok(filesystem.properties.etag.length > 0);
      assert.ok(filesystem.properties.lastModified);
      assert.ok(!filesystem.properties.leaseDuration);
      assert.ok(!filesystem.properties.publicAccess);
      assert.deepEqual(filesystem.properties.leaseState, "available");
      assert.deepEqual(filesystem.properties.leaseStatus, "unlocked");
      assert.deepEqual(filesystem.metadata!.key, "val");
    }
    // Gets next marker
    const marker = response.continuationToken;
    // Passing next marker as continuationToken
    iter = serviceClient
      .listFileSystems({
        includeMetadata: true,
        prefix: fileSystemNamePrefix
      })
      .byPage({ continuationToken: marker, maxPageSize: 2 });
    response = (await iter.next()).value;
    // Gets 2 containers
    for (const filesystem of response.fileSystemItems) {
      assert.ok(filesystem.name.startsWith(fileSystemNamePrefix));
      assert.ok(filesystem.properties.etag.length > 0);
      assert.ok(filesystem.properties.lastModified);
      assert.ok(!filesystem.properties.leaseDuration);
      assert.ok(!filesystem.properties.publicAccess);
      assert.deepEqual(filesystem.properties.leaseState, "available");
      assert.deepEqual(filesystem.properties.leaseStatus, "unlocked");
      assert.deepEqual(filesystem.metadata!.key, "val");
    }

    for (const client of fileSystemClients) {
      await client.deleteIfExists();
    }
  });

  it("createFileSystem and deleteFileSystem @loki @sql", async () => {
    const fileSystemName = getUniqueName("filesystem6");
    const fileSystemClient = serviceClient.getFileSystemClient(fileSystemName);
    const access = "filesystem";
    const metadata = { key: "value" };

    await fileSystemClient.create({
      access,
      metadata
    });

    const result = await fileSystemClient.getProperties();
    assert.deepEqual(result.publicAccess, access);
    assert.deepEqual(result.metadata, metadata);

    await serviceClient.getFileSystemClient(fileSystemName).delete();
    try {
      await fileSystemClient.getProperties();
      assert.fail(
        "Expecting an error in getting properties from a deleted block blob but didn't get one."
      );
    } catch (error) {
      assert.ok((error.statusCode as number) === 404);
    }
  });

  it("renameFileSystem should work @loki @sql", async function (this: Context) {
    const fileSystemName = getUniqueName("filesystem");
    const fileSystemClient = serviceClient.getFileSystemClient(fileSystemName);
    await fileSystemClient.create();

    const newFileSystemName = getUniqueName("newfilesystem");
    // const renameRes = await serviceClient.renameFileSystem(fileSystemName, newFileSystemName);
    const renameRes = await serviceClient["renameFileSystem"](
      fileSystemName,
      newFileSystemName
    );

    const newFileSystemClient =
      serviceClient.getFileSystemClient(newFileSystemName);
    assert.deepStrictEqual(newFileSystemClient, renameRes.fileSystemClient);
    await newFileSystemClient.getProperties();

    await newFileSystemClient.delete();
  });

  it("renameFileSystem should work with source lease @loki @sql", async function (this: Context) {
    const fileSystemName = getUniqueName("filesystem");
    const fileSystemClient = serviceClient.getFileSystemClient(fileSystemName);
    await fileSystemClient.create();

    const leaseClient = fileSystemClient.getDataLakeLeaseClient();
    await leaseClient.acquireLease(-1);

    const newFileSystemName = getUniqueName("newfilesystem");
    // const renameRes = await serviceClient.renameFileSystem(fileSystemName, newFileSystemName, {
    const renameRes = await serviceClient["renameFileSystem"](
      fileSystemName,
      newFileSystemName,
      {
        sourceCondition: { leaseId: leaseClient.leaseId }
      }
    );

    const newFileSystemClient =
      serviceClient.getFileSystemClient(newFileSystemName);
    assert.deepStrictEqual(newFileSystemClient, renameRes.fileSystemClient);
    await newFileSystemClient.getProperties();

    await newFileSystemClient.deleteIfExists();
  });

  it("undelete and list deleted file system should work @loki @sql", async function (this: Context) {
    const fileSystemName = getUniqueName("filesystem");
    const fileSystemClient = serviceClient.getFileSystemClient(fileSystemName);
    await fileSystemClient.create();

    const metadata = { a: "a" };
    await fileSystemClient.setMetadata(metadata);

    await fileSystemClient.delete();
    await delay(30 * 1000);

    let listed = false;
    for await (const fileSystemItem of serviceClient.listFileSystems({
      includeDeleted: true,
      includeMetadata: true
    })) {
      if (fileSystemItem.deleted && fileSystemItem.name === fileSystemName) {
        listed = true;
        // verify list container response
        assert.ok(fileSystemItem.versionId);
        assert.ok(fileSystemItem.deleted);
        assert.ok(fileSystemItem.properties.deletedOn);
        assert.ok(fileSystemItem.properties.remainingRetentionDays);
        assert.deepStrictEqual(fileSystemItem.metadata, metadata);

        const restoreRes = await serviceClient.undeleteFileSystem(
          fileSystemName,
          fileSystemItem.versionId!
        );
        assert.equal(restoreRes.fileSystemClient.name, fileSystemName);
        await restoreRes.fileSystemClient.delete();
        break;
      }
    }
    assert.ok(listed);
  });
});

function shouldSkip(context: Context) {
  if (
    context.currentTest!.title.indexOf("undelete") > -1 ||
    context.currentTest!.title.indexOf("renameFileSystem") > -1
  ) {
    context.skip();
  }
}
