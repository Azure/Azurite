// Copyright (c) Microsoft Corporation.
import assert from "assert";
import { Context } from "mocha";

import { delay } from "@azure/ms-rest-js";
// Licensed under the MIT license.
import {
  DataLakeDirectoryClient,
  DataLakeFileClient,
  DataLakeFileSystemClient,
  DataLakeServiceClient,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";

import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getEncryptionScope,
  getUniqueName,
  sleep,
  Test_CPK_INFO
} from "../../../testutils";
import DataLakeTestServerFactory from "../../DataLakeTestServerFactory";
import { AbortController } from "@azure/abort-controller";
import { toPermissionsString } from "../../../../src/dfs/storage-file-datalake/transforms";

describe("DataLakePathClient", () => {
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
    fileName = getUniqueName("file");
    fileClient = fileSystemClient.getFileClient(fileName);
    await fileClient.create();
    await fileClient.append(content, 0, content.length);
    await fileClient.flush(content.length);
  });

  afterEach(async function () {
    await fileSystemClient.deleteIfExists();
  });

  it("DataLakeFileClient create with meta data @loki @sql", async () => {
    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    const metadata = {
      a: "a",
      b: "b"
    };

    await testFileClient.create({ metadata: metadata });
    const result = await testFileClient.getProperties();
    assert.deepStrictEqual(result.metadata, metadata);
  });

  it("DataLakeFileClient create with permission and umark @loki @sql", async () => {
    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    const permissionString = "0777";
    const umask = "0057";

    await testFileClient.create({
      permissions: permissionString,
      umask: umask
    });
    const result = await testFileClient.getAccessControl();
    const permissions = {
      owner: {
        read: true,
        write: true,
        execute: true
      },
      group: {
        read: false,
        write: true,
        execute: false
      },
      other: {
        read: false,
        write: false,
        execute: false
      },
      stickyBit: false,
      extendedAcls: false
    };
    assert.deepEqual(result.permissions, permissions);
  });

  it("DataLakeFileClient create with headers @loki @sql", async () => {
    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    const httpHeader = {
      cacheControl: "control",
      contentEncoding: "encoding",
      contentLanguage: "language",
      contentDisposition: "disposition",
      contentType: "type/subtype"
    };

    await testFileClient.create({ pathHttpHeaders: httpHeader });
    const result = await testFileClient.getProperties();
    assert.equal(result.cacheControl, httpHeader.cacheControl);
    assert.equal(result.contentEncoding, httpHeader.contentEncoding);
    assert.equal(result.contentLanguage, httpHeader.contentLanguage);
    assert.equal(result.contentDisposition, httpHeader.contentDisposition);
    assert.equal(result.contentType, httpHeader.contentType);
  });

  it("DataLakeFileClient create with leaseId @loki @sql", async () => {
    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    const leaseId = "25180729-00c9-42b0-938b-ecabce67a007";
    const leaseDuration = 20;

    await testFileClient.create({
      proposedLeaseId: leaseId,
      leaseDuration: leaseDuration
    });
    const result = await testFileClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
  });

  it("DataLakeFileClient create with relative expiry @loki @sql", async () => {
    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    const timeToExpireInMs = 60 * 60 * 1000; // 1hour
    await testFileClient.create({ expiresOn: timeToExpireInMs });
    const result = await testFileClient.getProperties();
    assert.equal(
      result.createdOn!.getTime() + 1000 * 3600,
      result.expiresOn!.getTime()
    );
  });

  it("DataLakeFileClient create with absolute expiry @loki @sql", async () => {
    const now = new Date();
    const delta = 2 * 1000;
    const expiresOn = new Date(now.getTime() + delta);

    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    await testFileClient.create({ expiresOn: expiresOn });

    const result = await testFileClient.getProperties();
    const recordedExpiresOn = new Date(expiresOn.getTime());
    recordedExpiresOn.setMilliseconds(0); // milliseconds dropped
    assert.equal(result.expiresOn?.getTime(), recordedExpiresOn.getTime());

    await delay(delta);
    assert.ok(!(await testFileClient.exists()));
  });

  it("DataLakeFileClient create with all parameters @loki @sql", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };

    const permissionString = "0777";
    const umask = "0057";

    const httpHeader = {
      cacheControl: "control",
      contentEncoding: "encoding",
      contentLanguage: "language",
      contentDisposition: "disposition",
      contentType: "type/subtype"
    };
    const leaseId = "25180729-00c9-42b0-938b-ecabce67a007";
    const leaseDuration = 20;

    const timeToExpireInMs = 60 * 1000; // 60s

    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    await testFileClient.create({
      metadata: metadata,
      permissions: permissionString,
      umask: umask,
      pathHttpHeaders: httpHeader,
      proposedLeaseId: leaseId,
      leaseDuration: leaseDuration,
      expiresOn: timeToExpireInMs
    });

    const result = await testFileClient.getProperties();
    assert.deepStrictEqual(result.metadata, metadata);
    assert.equal(
      result.createdOn!.getTime() + 1000 * 60,
      result.expiresOn!.getTime()
    );
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
    assert.equal(result.cacheControl, httpHeader.cacheControl);
    assert.equal(result.contentEncoding, httpHeader.contentEncoding);
    assert.equal(result.contentLanguage, httpHeader.contentLanguage);
    assert.equal(result.contentDisposition, httpHeader.contentDisposition);
    assert.equal(result.contentType, httpHeader.contentType);
    const aclResult = await testFileClient.getAccessControl();
    const permissions = {
      owner: {
        read: true,
        write: true,
        execute: true
      },
      group: {
        read: false,
        write: true,
        execute: false
      },
      other: {
        read: false,
        write: false,
        execute: false
      },
      stickyBit: false,
      extendedAcls: false
    };
    assert.deepEqual(aclResult.permissions, permissions);
  });

  it("DataLakeFileClient createIfNotExists with default parameters @loki @sql", async () => {
    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);

    await testFileClient.createIfNotExists();
    assert.ok(await testFileClient.exists());
  });

  it("DataLakeFileClient createIfNotExists with meta data @loki @sql", async () => {
    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    const metadata = {
      a: "a",
      b: "b"
    };

    await testFileClient.createIfNotExists({ metadata: metadata });
    const result = await testFileClient.getProperties();
    assert.deepStrictEqual(result.metadata, metadata);
  });

  it("DataLakeFileClient createIfNotExists with permission and umark @loki @sql", async () => {
    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    const permissionString = "0777";
    const umask = "0057";

    await testFileClient.createIfNotExists({
      permissions: permissionString,
      umask: umask
    });
    const result = await testFileClient.getAccessControl();
    const permissions = {
      owner: {
        read: true,
        write: true,
        execute: true
      },
      group: {
        read: false,
        write: true,
        execute: false
      },
      other: {
        read: false,
        write: false,
        execute: false
      },
      stickyBit: false,
      extendedAcls: false
    };
    assert.deepEqual(result.permissions, permissions);
  });

  it("DataLakeFileClient createIfNotExists with headers @loki @sql", async () => {
    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    const httpHeader = {
      cacheControl: "control",
      contentEncoding: "encoding",
      contentLanguage: "language",
      contentDisposition: "disposition",
      contentType: "type/subtype"
    };

    await testFileClient.createIfNotExists({ pathHttpHeaders: httpHeader });
    const result = await testFileClient.getProperties();
    assert.equal(result.cacheControl, httpHeader.cacheControl);
    assert.equal(result.contentEncoding, httpHeader.contentEncoding);
    assert.equal(result.contentLanguage, httpHeader.contentLanguage);
    assert.equal(result.contentDisposition, httpHeader.contentDisposition);
    assert.equal(result.contentType, httpHeader.contentType);
  });

  it("DataLakeFileClient createIfNotExists with leaseId @loki @sql", async () => {
    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    const leaseId = "25180729-00c9-42b0-938b-ecabce67a007";
    const leaseDuration = 20;

    await testFileClient.createIfNotExists({
      proposedLeaseId: leaseId,
      leaseDuration: leaseDuration
    });
    const result = await testFileClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
  });

  it("DataLakeFileClient createIfNotExists with relative expiry @loki @sql", async () => {
    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    const timeToExpireInMs = 60 * 60 * 1000; // 1hour
    await testFileClient.createIfNotExists({ expiresOn: timeToExpireInMs });
    const result = await testFileClient.getProperties();
    assert.equal(
      result.createdOn!.getTime() + 1000 * 3600,
      result.expiresOn!.getTime()
    );
  });

  it("DataLakeFileClient createIfNotExists with absolute expiry @loki @sql", async () => {
    const now = new Date();
    const delta = 2 * 1000;
    const expiresOn = new Date(now.getTime() + delta);

    const testFileName = getUniqueName("testfile");
    const testFileClient = fileSystemClient.getFileClient(testFileName);
    await testFileClient.createIfNotExists({ expiresOn: expiresOn });

    const result = await testFileClient.getProperties();
    const recordedExpiresOn = new Date(expiresOn.getTime());
    recordedExpiresOn.setMilliseconds(0); // milliseconds dropped
    assert.equal(result.expiresOn?.getTime(), recordedExpiresOn.getTime());

    await delay(delta);
    assert.ok(!(await testFileClient.exists()));
  });

  it("DataLakeDirectoryClient create with default parameters @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testdirClient = fileSystemClient.getDirectoryClient(testDirName);
    await testdirClient.create();
    assert.ok(await testdirClient.exists());
  });

  it("DataLakeDirectoryClient create with meta data @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);
    const metadata = {
      a: "a",
      b: "b"
    };

    await testDirClient.create({ metadata: metadata });
    const result = await testDirClient.getProperties();
    assert.deepStrictEqual(result.metadata, {
      ...metadata,
      hdi_isfolder: "true"
    });
  });

  it("DataLakeDirectoryClient create with permission and umark @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);
    const permissionString = "0777";
    const umask = "0057";

    await testDirClient.create({ permissions: permissionString, umask: umask });
    const result = await testDirClient.getAccessControl();
    const permissions = {
      owner: {
        read: true,
        write: true,
        execute: true
      },
      group: {
        read: false,
        write: true,
        execute: false
      },
      other: {
        read: false,
        write: false,
        execute: false
      },
      stickyBit: false,
      extendedAcls: false
    };
    assert.deepEqual(result.permissions, permissions);
  });

  it("DataLakeDirectoryClient create with headers @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);
    const httpHeader = {
      cacheControl: "control",
      contentEncoding: "encoding",
      contentLanguage: "language",
      contentDisposition: "disposition",
      contentType: "type/subtype"
    };

    await testDirClient.create({ pathHttpHeaders: httpHeader });
    const result = await testDirClient.getProperties();
    assert.equal(result.cacheControl, httpHeader.cacheControl);
    assert.equal(result.contentEncoding, httpHeader.contentEncoding);
    assert.equal(result.contentLanguage, httpHeader.contentLanguage);
    assert.equal(result.contentDisposition, httpHeader.contentDisposition);
    assert.equal(result.contentType, httpHeader.contentType);
  });

  it("DataLakeDirectoryClient create with leaseId @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);
    const leaseId = "25180729-00c9-42b0-938b-ecabce67a007";
    const leaseDuration = 20;

    await testDirClient.create({
      proposedLeaseId: leaseId,
      leaseDuration: leaseDuration
    });
    const result = await testDirClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
  });

  it("DataLakeDirectoryClient create with all parameters @loki @sql", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };

    const permissionString = "0777";
    const umask = "0057";

    const httpHeader = {
      cacheControl: "control",
      contentEncoding: "encoding",
      contentLanguage: "language",
      contentDisposition: "disposition",
      contentType: "type/subtype"
    };
    const leaseId = "25180729-00c9-42b0-938b-ecabce67a007";
    const leaseDuration = 20;

    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getFileClient(testDirName);
    await testDirClient.create({
      metadata: metadata,
      permissions: permissionString,
      umask: umask,
      pathHttpHeaders: httpHeader,
      proposedLeaseId: leaseId,
      leaseDuration: leaseDuration
    });

    const result = await testDirClient.getProperties();
    assert.deepStrictEqual(result.metadata, metadata);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
    assert.equal(result.cacheControl, httpHeader.cacheControl);
    assert.equal(result.contentEncoding, httpHeader.contentEncoding);
    assert.equal(result.contentLanguage, httpHeader.contentLanguage);
    assert.equal(result.contentDisposition, httpHeader.contentDisposition);
    assert.equal(result.contentType, httpHeader.contentType);
    const aclResult = await testDirClient.getAccessControl();
    const permissions = {
      owner: {
        read: true,
        write: true,
        execute: true
      },
      group: {
        read: false,
        write: true,
        execute: false
      },
      other: {
        read: false,
        write: false,
        execute: false
      },
      stickyBit: false,
      extendedAcls: false
    };
    assert.deepEqual(aclResult.permissions, permissions);
  });

  it("DataLakeDirectoryClient create with relative expiry @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);
    const timeToExpireInMs = 60 * 60 * 1000; // 1hour
    try {
      await testDirClient.create({ expiresOn: timeToExpireInMs });
      assert.fail("Creating directory with expiry should fail.");
    } catch (error) {
      assert.ok(
        (error as any).message.includes(
          "Set Expiry is not supported for a directory"
        )
      );
    }
  });

  it("DataLakeDirectoryClient create with absolute expiry @loki @sql", async () => {
    const now = new Date();
    const delta = 20 * 1000;
    const expiresOn = new Date(now.getTime() + delta);

    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);

    try {
      await testDirClient.create({ expiresOn });
      assert.fail("Creating directory with expiry should fail.");
    } catch (error) {
      assert.ok(
        (error as any).message.includes(
          "Set Expiry is not supported for a directory"
        )
      );
    }
  });

  it("DataLakeDirectoryClient createIfNotExists with default parameters @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testdirClient = fileSystemClient.getDirectoryClient(testDirName);
    await testdirClient.createIfNotExists();
    assert.ok(await testdirClient.exists());
  });

  it("DataLakeDirectoryClient createIfNotExists with meta data @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);
    const metadata = {
      a: "a",
      b: "b"
    };

    await testDirClient.createIfNotExists({ metadata: metadata });
    const result = await testDirClient.getProperties();
    assert.deepStrictEqual(result.metadata, {
      ...metadata,
      hdi_isfolder: "true"
    });
  });

  it("DataLakeDirectoryClient createIfNotExists with permission and umark @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);
    const permissionString = "0777";
    const umask = "0057";

    await testDirClient.createIfNotExists({
      permissions: permissionString,
      umask: umask
    });
    const result = await testDirClient.getAccessControl();
    const permissions = {
      owner: {
        read: true,
        write: true,
        execute: true
      },
      group: {
        read: false,
        write: true,
        execute: false
      },
      other: {
        read: false,
        write: false,
        execute: false
      },
      stickyBit: false,
      extendedAcls: false
    };
    assert.deepEqual(result.permissions, permissions);
  });

  it("DataLakeDirectoryClient createIfNotExists with headers @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);
    const httpHeader = {
      cacheControl: "control",
      contentEncoding: "encoding",
      contentLanguage: "language",
      contentDisposition: "disposition",
      contentType: "type/subtype"
    };

    await testDirClient.createIfNotExists({ pathHttpHeaders: httpHeader });
    const result = await testDirClient.getProperties();
    assert.equal(result.cacheControl, httpHeader.cacheControl);
    assert.equal(result.contentEncoding, httpHeader.contentEncoding);
    assert.equal(result.contentLanguage, httpHeader.contentLanguage);
    assert.equal(result.contentDisposition, httpHeader.contentDisposition);
    assert.equal(result.contentType, httpHeader.contentType);
  });

  it("DataLakeDirectoryClient createIfNotExists with leaseId @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);
    const leaseId = "25180729-00c9-42b0-938b-ecabce67a007";
    const leaseDuration = 20;

    await testDirClient.createIfNotExists({
      proposedLeaseId: leaseId,
      leaseDuration: leaseDuration
    });
    const result = await testDirClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
  });

  it("DataLakeDirectoryClient createIfNotExists with relative expiry @loki @sql", async () => {
    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);
    const timeToExpireInMs = 60 * 60 * 1000; // 1hour
    try {
      await testDirClient.createIfNotExists({ expiresOn: timeToExpireInMs });
      assert.fail("Creating directory with expiry should fail.");
    } catch (error) {
      assert.ok(
        (error as any).message.includes(
          "Set Expiry is not supported for a directory"
        )
      );
    }
  });

  it("DataLakeDirectoryClient createIfNotExists with absolute expiry @loki @sql", async () => {
    const now = new Date();
    const delta = 20 * 1000;
    const expiresOn = new Date(now.getTime() + delta);

    const testDirName = getUniqueName("testdir");
    const testDirClient = fileSystemClient.getDirectoryClient(testDirName);

    try {
      await testDirClient.createIfNotExists({ expiresOn: expiresOn });
      assert.fail("Creating directory with expiry should fail.");
    } catch (error) {
      assert.ok(
        (error as any).message.includes(
          "Set Expiry is not supported for a directory"
        )
      );
    }
  });

  it("read with with default parameters @loki @sql", async () => {
    const result = await fileClient.read();
    const read = await bodyToString(result, content.length);
    assert.deepStrictEqual(read, content);
  });

  it("read should not have aborted error after read finishes @loki @sql", async () => {
    const aborter = new AbortController();
    const result = await fileClient.read(0, undefined, {
      abortSignal: aborter.signal
    });
    const read = await bodyToString(result, content.length);
    assert.deepStrictEqual(read, content);
    aborter.abort();
  });

  it("read all parameters set @loki @sql", async () => {
    // For browser scenario, please ensure CORS settings exposed headers: content-md5,x-ms-content-crc64
    // So JS can get contentCrc64 and contentMD5.
    const result1 = await fileClient.read(0, 1, {
      rangeGetContentCrc64: true
    });
    assert.ok(result1.clientRequestId);
    // assert.ok(result1.contentCrc64!);
    assert.deepStrictEqual(await bodyToString(result1, 1), content[0]);
    assert.ok(result1.clientRequestId);

    const result2 = await fileClient.read(1, 1, {
      rangeGetContentMD5: true
    });
    assert.ok(result2.clientRequestId);
    assert.ok(result2.contentMD5!);

    let exceptionCaught = false;
    try {
      await fileClient.read(2, 1, {
        rangeGetContentMD5: true,
        rangeGetContentCrc64: true
      });
    } catch (err: any) {
      exceptionCaught = true;
    }
    assert.ok(exceptionCaught);
  });

  it("setMetadata with new metadata set @loki @sql", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };
    await fileClient.setMetadata(metadata);
    const result = await fileClient.getProperties();
    assert.deepStrictEqual(result.metadata, metadata);
  });

  it("setMetadata with cleaning up metadata @loki @sql", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };
    await fileClient.setMetadata(metadata);
    const result = await fileClient.getProperties();
    assert.deepStrictEqual(result.metadata, metadata);

    await fileClient.setMetadata();
    const result2 = await fileClient.getProperties();
    assert.deepStrictEqual(result2.metadata, {});
  });

  it("setHttpHeaders with default parameters @loki @sql", async () => {
    await fileClient.setHttpHeaders({});
    const result = await fileClient.getProperties();

    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, {});
    assert.ok(!result.cacheControl);
    assert.ok(!result.contentType);
    assert.ok(!result.contentMD5);
    assert.ok(!result.contentEncoding);
    assert.ok(!result.contentLanguage);
    assert.ok(!result.contentDisposition);
  });

  it("setHttpHeaders with all parameters set @loki @sql", async () => {
    const headers = {
      cacheControl: "cacheControl",
      contentDisposition: "contentDisposition",
      contentEncoding: "contentEncoding",
      contentLanguage: "contentLanguage",
      contentMD5: new Uint8Array([1, 2, 3, 4]),
      contentType: "contentType"
    };
    await fileClient.setHttpHeaders(headers);
    const result = await fileClient.getProperties();
    assert.ok(result.date);

    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, {});
    assert.deepStrictEqual(result.cacheControl, headers.cacheControl);
    assert.deepStrictEqual(result.contentType, headers.contentType);
    assert.deepStrictEqual(
      Buffer.from(result.contentMD5!, 0),
      Buffer.from(headers.contentMD5, 0)
    );
    assert.deepStrictEqual(result.contentEncoding, headers.contentEncoding);
    assert.deepStrictEqual(result.contentLanguage, headers.contentLanguage);
    assert.deepStrictEqual(
      result.contentDisposition,
      headers.contentDisposition
    );
  });

  it("delete @loki @sql", async () => {
    await fileClient.delete();
  });

  it("read with default parameters and tracing @loki @sql", async () => {
    const result = await fileClient.read(undefined, undefined);
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
  });

  it("verify fileName and fileSystemName passed to the client @loki @sql", async () => {
    const accountName = "myaccount";
    const path = "file/part/1.txt";
    const newClient = new DataLakeFileClient(
      `https://${accountName}.dfs.core.windows.net/` +
        fileSystemName +
        "/" +
        path
    );
    assert.equal(
      newClient.fileSystemName,
      fileSystemName,
      "File system name is not the same as the one provided."
    );
    assert.equal(
      newClient.name,
      path,
      "File name is not the same as the one provided."
    );
    assert.equal(
      newClient.accountName,
      accountName,
      "Account name is not the same as the one provided."
    );
  });

  it("append with acquire lease @loki @sql", async () => {
    const body = "HelloWorld";

    const tempFileName = getUniqueName("tempfile2");
    const tempFileClient = fileSystemClient.getFileClient(tempFileName);
    const leaseId = "ca761232ed4211cebacd00aa0057b223";

    await tempFileClient.create();

    await tempFileClient.append(body, 0, body.length, {
      proposedLeaseId: leaseId,
      leaseDurationInSeconds: 15,
      leaseAction: "acquire"
    });

    let gotError = false;
    try {
      await tempFileClient.append(body, body.length, body.length, {
        flush: true
      });
    } catch (err) {
      gotError = true;
      assert.ok(
        err.message.startsWith(
          "There is currently a lease on the resource and no lease ID was specified in the request."
        )
      );
    }
    assert.ok(
      gotError,
      "Should throw out an exception to write to a leased file without lease id"
    );

    await tempFileClient.append(body, body.length, body.length, {
      conditions: {
        leaseId: leaseId
      },
      flush: true
    });

    const properties = await tempFileClient.getProperties();
    assert.equal(properties.contentLength, body.length * 2);
    assert.equal(properties.leaseState, "leased");
    assert.equal(properties.leaseDuration, "fixed");
    assert.equal(properties.leaseStatus, "locked");

    await tempFileClient.delete(false, {
      conditions: {
        leaseId: leaseId
      }
    });
  });

  it("append with auto-renew lease @loki @sql", async () => {
    const body = "HelloWorld";

    const tempFileName = getUniqueName("tempfile2");
    const tempFileClient = fileSystemClient.getFileClient(tempFileName);
    const leaseId = "ca761232ed4211cebacd00aa0057b223";

    await tempFileClient.create({
      proposedLeaseId: leaseId,
      leaseDuration: 15
    });

    const properties = await tempFileClient.getProperties();
    assert.equal(properties.leaseState, "leased");
    assert.equal(properties.leaseDuration, "fixed");
    assert.equal(properties.leaseStatus, "locked");

    await sleep(15);

    await tempFileClient.append(body, 0, body.length, {
      conditions: { leaseId: leaseId },
      leaseDurationInSeconds: 15,
      leaseAction: "auto-renew"
    });

    let gotError = false;
    try {
      await tempFileClient.append(body, body.length, body.length, {
        flush: true
      });
    } catch (err) {
      gotError = true;
      assert.ok(
        err.message.startsWith(
          "There is currently a lease on the resource and no lease ID was specified in the request."
        )
      );
    }
    assert.ok(
      gotError,
      "Should throw out an exception to write to a leased file without lease id"
    );

    await tempFileClient.delete(false, {
      conditions: {
        leaseId: leaseId
      }
    });
  });

  it("append with release lease @loki @sql", async () => {
    const body = "HelloWorld";

    const tempFileName = getUniqueName("tempfile2");
    const tempFileClient = fileSystemClient.getFileClient(tempFileName);
    const leaseId = "ca761232ed4211cebacd00aa0057b223";

    await tempFileClient.create({
      proposedLeaseId: leaseId,
      leaseDuration: 15
    });

    await tempFileClient.append(body, 0, body.length, {
      conditions: { leaseId: leaseId }
    });

    await tempFileClient.append(body, body.length, body.length, {
      conditions: { leaseId: leaseId },
      leaseAction: "release",
      flush: true
    });

    const properties = await tempFileClient.getProperties();
    assert.equal(properties.leaseState, "available");
    assert.equal(properties.leaseStatus, "unlocked");

    await tempFileClient.delete();
  });

  it("flush with acquire lease @loki @sql", async () => {
    const body = "HelloWorld";

    const tempFileName = getUniqueName("tempfile2");
    const tempFileClient = fileSystemClient.getFileClient(tempFileName);
    const leaseId = "ca761232ed4211cebacd00aa0057b223";

    await tempFileClient.create();

    await tempFileClient.append(body, 0, body.length);
    await tempFileClient.append(body, body.length, body.length);

    await tempFileClient.flush(body.length * 2, {
      proposedLeaseId: leaseId,
      leaseDurationInSeconds: 15,
      leaseAction: "acquire"
    });

    let gotError = false;
    try {
      await tempFileClient.delete();
    } catch (err) {
      gotError = true;
      assert.ok(
        err.message.startsWith(
          "There is currently a lease on the resource and no lease ID was specified in the request."
        )
      );
    }
    assert.ok(
      gotError,
      "Should throw out an exception to write to a leased file without lease id"
    );

    const properties = await tempFileClient.getProperties();
    assert.equal(properties.contentLength, body.length * 2);
    assert.equal(properties.leaseState, "leased");
    assert.equal(properties.leaseDuration, "fixed");
    assert.equal(properties.leaseStatus, "locked");

    await tempFileClient.delete(false, {
      conditions: {
        leaseId: leaseId
      }
    });
  });

  it("flush with auto-renew lease @loki @sql", async () => {
    const body = "HelloWorld";

    const tempFileName = getUniqueName("tempfile2");
    const tempFileClient = fileSystemClient.getFileClient(tempFileName);
    const leaseId = "ca761232ed4211cebacd00aa0057b223";

    await tempFileClient.create({
      proposedLeaseId: leaseId,
      leaseDuration: 15
    });

    await tempFileClient.append(body, 0, body.length, {
      conditions: { leaseId: leaseId }
    });
    await tempFileClient.append(body, body.length, body.length, {
      conditions: { leaseId: leaseId }
    });

    await sleep(15);

    await tempFileClient.flush(body.length * 2, {
      conditions: { leaseId: leaseId },
      leaseDurationInSeconds: 15,
      leaseAction: "auto-renew"
    });

    let gotError = false;
    try {
      await tempFileClient.delete();
    } catch (err) {
      gotError = true;
      assert.ok(
        err.message.startsWith(
          "There is currently a lease on the resource and no lease ID was specified in the request."
        )
      );
    }
    assert.ok(
      gotError,
      "Should throw out an exception to write to a leased file without lease id"
    );

    const properties = await tempFileClient.getProperties();
    assert.equal(properties.contentLength, body.length * 2);
    assert.equal(properties.leaseState, "leased");
    assert.equal(properties.leaseDuration, "fixed");
    assert.equal(properties.leaseStatus, "locked");

    await tempFileClient.delete(false, {
      conditions: {
        leaseId: leaseId
      }
    });
  });

  it("flush with release lease @loki @sql", async () => {
    const body = "HelloWorld";

    const tempFileName = getUniqueName("tempfile2");
    const tempFileClient = fileSystemClient.getFileClient(tempFileName);
    const leaseId = "ca761232ed4211cebacd00aa0057b223";

    await tempFileClient.create({
      proposedLeaseId: leaseId,
      leaseDuration: 15
    });

    await tempFileClient.append(body, 0, body.length, {
      conditions: { leaseId: leaseId }
    });
    await tempFileClient.append(body, body.length, body.length, {
      conditions: { leaseId: leaseId }
    });

    await tempFileClient.flush(body.length * 2, {
      conditions: { leaseId: leaseId },
      leaseAction: "release"
    });

    const properties = await tempFileClient.getProperties();
    assert.equal(properties.leaseState, "available");
    assert.equal(properties.leaseStatus, "unlocked");

    await tempFileClient.delete();
  });

  it("append with flush should work @loki @sql", async () => {
    const body = "HelloWorld";

    const tempFileName = getUniqueName("tempfile2");
    const tempFileClient = fileSystemClient.getFileClient(tempFileName);

    await tempFileClient.create();

    await tempFileClient.append(body, 0, body.length, {
      transactionalContentMD5: new Uint8Array([])
    });
    await tempFileClient.append(body, body.length, body.length, {
      transactionalContentMD5: new Uint8Array([])
    });
    await tempFileClient.append(body, body.length * 2, body.length, {
      transactionalContentMD5: new Uint8Array([]),
      flush: true
    });

    const properties = await tempFileClient.getProperties();
    assert.deepStrictEqual(properties.contentLength, body.length * 3);

    await tempFileClient.delete();
  });

  it("append & flush should work @loki @sql", async () => {
    const body = "HelloWorld";

    const tempFileName = getUniqueName("tempfile2");
    const tempFileClient = fileSystemClient.getFileClient(tempFileName);

    await tempFileClient.create();

    await tempFileClient.append(body, 0, body.length, {
      transactionalContentMD5: new Uint8Array([])
    });
    await tempFileClient.append(body, body.length, body.length, {
      transactionalContentMD5: new Uint8Array([])
    });
    await tempFileClient.append(body, body.length * 2, body.length, {
      transactionalContentMD5: new Uint8Array([])
    });

    await tempFileClient.flush(body.length * 3);

    const properties = await tempFileClient.getProperties();
    assert.deepStrictEqual(properties.contentLength, body.length * 3);

    await tempFileClient.delete();
  });

  it("append & flush should work with all parameters @loki @sql", async () => {
    const body = "HelloWorld";

    const tempFileName = getUniqueName("tempfile2");
    const tempFileClient = fileSystemClient.getFileClient(tempFileName);

    const permissions = {
      owner: { read: false, write: false, execute: false },
      group: { read: false, write: false, execute: false },
      other: { read: false, write: false, execute: false },
      stickyBit: false,
      extendedAcls: false
    };
    const permissionsString = toPermissionsString(permissions);
    const metadata = {
      a: "val-a",
      b: "val-b"
    };
    let pathHttpHeaders = {
      cacheControl: "cacheControl",
      contentEncoding: "contentEncoding",
      contentLanguage: "contentLanguage",
      contentDisposition: "contentDisposition",
      contentType: "contentType"
    };
    await tempFileClient.create({
      permissions: permissionsString,
      metadata,
      umask: "0000",
      pathHttpHeaders
    });

    let properties = await tempFileClient.getProperties();
    assert.deepStrictEqual(properties.contentLength, 0);
    assert.deepStrictEqual(
      properties.cacheControl,
      pathHttpHeaders.cacheControl
    );
    assert.deepStrictEqual(
      properties.contentEncoding,
      pathHttpHeaders.contentEncoding
    );
    assert.deepStrictEqual(
      properties.contentLanguage,
      pathHttpHeaders.contentLanguage
    );
    assert.deepStrictEqual(
      properties.contentDisposition,
      pathHttpHeaders.contentDisposition
    );
    assert.deepStrictEqual(properties.contentType, pathHttpHeaders.contentType);
    assert.deepStrictEqual(properties.metadata, metadata);

    const acl = await tempFileClient.getAccessControl();
    assert.deepStrictEqual(acl.permissions, permissions);

    await tempFileClient.append(body, 0, body.length, {
      transactionalContentMD5: new Uint8Array([])
    });
    await tempFileClient.append(body, body.length, body.length, {
      transactionalContentMD5: new Uint8Array([])
    });
    await tempFileClient.append(body, body.length * 2, body.length, {
      transactionalContentMD5: new Uint8Array([])
    });

    pathHttpHeaders = {
      cacheControl: "cacheControl2",
      contentEncoding: "contentEncoding2",
      contentLanguage: "contentLanguage2",
      contentDisposition: "contentDisposition2",
      contentType: "contentType2"
    };
    await tempFileClient.flush(body.length * 3, {
      retainUncommittedData: true,
      close: true,
      pathHttpHeaders
    });

    properties = await tempFileClient.getProperties();
    assert.deepStrictEqual(properties.contentLength, body.length * 3);
    assert.deepStrictEqual(
      properties.cacheControl,
      pathHttpHeaders.cacheControl
    );
    assert.deepStrictEqual(
      properties.contentEncoding,
      pathHttpHeaders.contentEncoding
    );
    assert.deepStrictEqual(
      properties.contentLanguage,
      pathHttpHeaders.contentLanguage
    );
    assert.deepStrictEqual(
      properties.contentDisposition,
      pathHttpHeaders.contentDisposition
    );
    assert.deepStrictEqual(properties.contentType, pathHttpHeaders.contentType);
    assert.deepStrictEqual(properties.metadata, metadata);

    await tempFileClient.delete();
  });

  it("exists returns true on an existing file @loki @sql", async () => {
    const result = await fileClient.exists();
    assert.ok(result, "exists() should return true for an existing file");
  });

  it("exists returns false on non-existing file or directory @loki @sql", async () => {
    const newFileClient = fileSystemClient.getFileClient(
      getUniqueName("newFile")
    );
    const result = await newFileClient.exists();
    assert.ok(
      result === false,
      "exists() should return false for a non-existing file"
    );

    const newDirectoryClient = fileSystemClient.getDirectoryClient(
      getUniqueName("newDirectory")
    );
    const dirResult = await newDirectoryClient.exists();
    assert.ok(
      dirResult === false,
      "exists() should return false for a non-existing directory"
    );
  });

  it("DataLakeDirectoryClient-createIfNotExists @loki @sql", async () => {
    const directoryName = getUniqueName("dir");
    const directoryClient = fileSystemClient.getDirectoryClient(directoryName);
    const res = await directoryClient.createIfNotExists();
    assert.ok(res.succeeded);

    const res2 = await directoryClient.createIfNotExists();
    assert.ok(!res2.succeeded);
    assert.equal(res2.errorCode, "PathAlreadyExists");
  });

  it("DataLakeFileClient-createIfNotExists @loki @sql", async () => {
    const res = await fileClient.createIfNotExists();
    assert.ok(!res.succeeded);
    assert.equal(res.errorCode, "PathAlreadyExists");
  });

  it("DataLakePathClient-deleteIfExists @loki @sql", async () => {
    const directoryName = getUniqueName("dir");
    const directoryClient = fileSystemClient.getDirectoryClient(directoryName);
    const res = await directoryClient.deleteIfExists();
    assert.ok(!res.succeeded);
    assert.equal(res.errorCode, "PathNotFound");

    await directoryClient.create();
    const res2 = await directoryClient.deleteIfExists();
    assert.ok(res2.succeeded);
  });

  it("DataLakePathClient-deleteIfExists when parent not exists @loki @sql", async () => {
    const directoryName = getUniqueName("dir");
    const directoryClient = fileSystemClient.getDirectoryClient(directoryName);
    const newFileClient = directoryClient.getFileClient(fileName);
    const res2 = await newFileClient.deleteIfExists();
    assert.ok(!res2.succeeded);
    assert.deepStrictEqual(res2.errorCode, "PathNotFound");
  });

  it("set expiry - NeverExpire @loki @sql", async () => {
    await fileClient.setExpiry("NeverExpire");
    const getRes = await fileClient.getProperties();
    assert.equal(getRes.expiresOn, undefined);
  });

  it("set expiry - Absolute @loki @sql", async () => {
    const now = new Date(); // Flaky workaround for the recording to work.
    const delta = 5 * 1000;
    const expiresOn = new Date(now.getTime() + delta);
    await fileClient.setExpiry("Absolute", { expiresOn });

    const getRes = await fileClient.getProperties();
    const recordedExpiresOn = new Date(expiresOn.getTime());
    recordedExpiresOn.setMilliseconds(0); // milliseconds dropped
    assert.equal(getRes.expiresOn?.getTime(), recordedExpiresOn.getTime());

    await delay(delta);
    assert.ok(!(await fileClient.exists()));
  });

  it("set expiry - RelativeToNow @loki @sql", async () => {
    const delta = 1000;
    await fileClient.setExpiry("RelativeToNow", { timeToExpireInMs: delta });

    await delay(delta);
    assert.ok(!(await fileClient.exists()));
  });

  it("set expiry - RelativeToCreation @loki @sql", async () => {
    const delta = 1000 * 3600 + 0.12;
    await fileClient.setExpiry("RelativeToCreation", {
      timeToExpireInMs: delta
    });

    const getRes = await fileClient.getProperties();
    assert.equal(
      getRes.expiresOn?.getTime(),
      getRes.createdOn!.getTime() + Math.round(delta)
    );
  });

  it("set expiry - override @loki @sql", async () => {
    const delta = 1000 * 3600;
    await fileClient.setExpiry("RelativeToCreation", {
      timeToExpireInMs: delta
    });

    const getRes = await fileClient.getProperties();
    assert.equal(
      getRes.expiresOn?.getTime(),
      getRes.createdOn!.getTime() + delta
    );

    await fileClient.setExpiry("NeverExpire");
    const getRes2 = await fileClient.getProperties();
    assert.equal(getRes2.expiresOn, undefined);
  });
});

describe.skip("DataLakePathClient with CPK", () => {
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
  let fileName: string;
  let dirName: string;
  let fileClient: DataLakeFileClient;
  let dirClient: DataLakeDirectoryClient;
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
    fileName = getUniqueName("file");
    fileClient = fileSystemClient.getFileClient(fileName);
    dirName = getUniqueName("dir");
    dirClient = fileSystemClient.getDirectoryClient(dirName);
  });

  afterEach(async function () {
    await fileSystemClient.deleteIfExists();
  });

  it("file create, append, flush and read with cpk @loki @sql", async () => {
    await fileClient.create({
      customerProvidedKey: Test_CPK_INFO
    });
    await fileClient.append(content, 0, content.length, {
      customerProvidedKey: Test_CPK_INFO
    });
    await fileClient.flush(content.length, {
      customerProvidedKey: Test_CPK_INFO
    });

    const result = await fileClient.read(0, undefined, {
      customerProvidedKey: Test_CPK_INFO
    });
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
  });

  it("file getProperties with CPK @loki @sql", async () => {
    await fileClient.create({
      customerProvidedKey: Test_CPK_INFO
    });

    const result = await fileClient.getProperties({
      customerProvidedKey: Test_CPK_INFO
    });

    assert.equal(result.contentLength, 0);
  });

  it("file getProperties without CPK on a file with CPK @loki @sql", async () => {
    await fileClient.create({
      customerProvidedKey: Test_CPK_INFO
    });

    let gotError = false;
    try {
      await fileClient.getProperties();
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }

    assert.ok(gotError, "Should got an error");
  });

  it("file getProperties with CPK on a file without CPK @loki @sql", async () => {
    await fileClient.create();

    let gotError = false;

    try {
      await fileClient.getProperties({
        customerProvidedKey: Test_CPK_INFO
      });
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }

    assert.ok(gotError, "Should got an error");
  });

  it("file exists with CPK @loki @sql", async () => {
    await fileClient.create({
      customerProvidedKey: Test_CPK_INFO
    });

    assert.ok(
      await fileClient.exists({
        customerProvidedKey: Test_CPK_INFO
      })
    );
  });

  it("file exists with CPK on a file without CPK @loki @sql", async () => {
    await fileClient.create();

    assert.ok(
      await fileClient.exists({
        customerProvidedKey: Test_CPK_INFO
      })
    );
  });

  it("file exists without CPK on a file with CPK @loki @sql", async () => {
    await fileClient.create({
      customerProvidedKey: Test_CPK_INFO
    });

    assert.ok(await fileClient.exists());
  });

  it("file append with cpk to a file without CPK @loki @sql", async () => {
    await fileClient.create();

    let gotError = false;

    try {
      await fileClient.append(content, 0, content.length, {
        customerProvidedKey: Test_CPK_INFO
      });
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }

    assert.ok(gotError, "Should got an error");
  });

  it("file append without cpk to a file with CPK @loki @sql", async () => {
    await fileClient.create({
      customerProvidedKey: Test_CPK_INFO
    });

    let gotError = false;
    try {
      await fileClient.append(content, 0, content.length);
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }

    assert.ok(gotError, "Should got an error");
  });

  it("file flush with cpk to a file without CPK @loki @sql", async () => {
    await fileClient.create();
    await fileClient.append(content, 0, content.length);

    let gotError = false;
    try {
      await fileClient.flush(content.length, {
        customerProvidedKey: Test_CPK_INFO
      });
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }
    assert.ok(gotError, "Should got an error");
  });

  it("file flush without cpk to a file with CPK @loki @sql", async () => {
    await fileClient.create({
      customerProvidedKey: Test_CPK_INFO
    });
    await fileClient.append(content, 0, content.length, {
      customerProvidedKey: Test_CPK_INFO
    });

    let gotError = false;
    try {
      await fileClient.flush(content.length);
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }
    assert.ok(gotError, "Should got an error");
  });

  it("file read without cpk to a file with CPK @loki @sql", async () => {
    await fileClient.create({
      customerProvidedKey: Test_CPK_INFO
    });
    await fileClient.append(content, 0, content.length, {
      customerProvidedKey: Test_CPK_INFO
    });
    await fileClient.flush(content.length, {
      customerProvidedKey: Test_CPK_INFO
    });

    let gotError = false;
    try {
      await fileClient.read(0, undefined);
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }
    assert.ok(gotError, "Should got an error");
  });

  it("file read with cpk to a file without CPK @loki @sql", async () => {
    await fileClient.create();
    await fileClient.append(content, 0, content.length);
    await fileClient.flush(content.length);

    let gotError = false;
    try {
      await fileClient.read(0, undefined, {
        customerProvidedKey: Test_CPK_INFO
      });
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }

    assert.ok(gotError, "Should got an error");
  });

  it("file setMetadata with CPK @loki @sql", async () => {
    await fileClient.create({
      customerProvidedKey: Test_CPK_INFO
    });

    const metadata = {
      a: "a",
      b: "b"
    };
    await fileClient.setMetadata(metadata, {
      customerProvidedKey: Test_CPK_INFO
    });
    const result = await fileClient.getProperties({
      customerProvidedKey: Test_CPK_INFO
    });
    assert.deepStrictEqual(result.metadata, metadata);
  });

  it("file setMetadata without cpk to a file with CPK @loki @sql", async () => {
    await fileClient.create({
      customerProvidedKey: Test_CPK_INFO
    });

    let gotError = false;
    try {
      await fileClient.setMetadata({});
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }
    assert.ok(gotError, "Should got an error");
  });

  it("file setMetadata with cpk to a file without CPK @loki @sql", async () => {
    await fileClient.create();

    let gotError = false;
    try {
      await fileClient.setMetadata(
        {},
        {
          customerProvidedKey: Test_CPK_INFO
        }
      );
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }
    assert.ok(gotError, "Should got an error");
  });

  it("directory create and getProperties with CPK @loki @sql", async () => {
    await dirClient.create({
      customerProvidedKey: Test_CPK_INFO
    });
    await dirClient.getProperties({
      customerProvidedKey: Test_CPK_INFO
    });
  });

  it("directory getProperties with CPK on a directory without CPK @loki @sql", async () => {
    await dirClient.create();

    let gotError = false;
    try {
      await dirClient.getProperties({
        customerProvidedKey: Test_CPK_INFO
      });
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }
    assert.ok(gotError, "Should got an error");
  });

  it("directory getProperties without CPK on a directory with CPK @loki @sql", async () => {
    await dirClient.create({
      customerProvidedKey: Test_CPK_INFO
    });

    let gotError = false;
    try {
      await dirClient.getProperties();
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }
    assert.ok(gotError, "Should got an error");
  });

  it("directory exists with CPK @loki @sql", async () => {
    await dirClient.create({
      customerProvidedKey: Test_CPK_INFO
    });
    assert.ok(
      await dirClient.exists({
        customerProvidedKey: Test_CPK_INFO
      })
    );
  });

  it("directory exists with CPK on a directory without CPK @loki @sql", async () => {
    await dirClient.create();
    assert.ok(
      await dirClient.exists({
        customerProvidedKey: Test_CPK_INFO
      })
    );
  });

  it("directory exists without CPK on a directory with CPK @loki @sql", async () => {
    await dirClient.create({
      customerProvidedKey: Test_CPK_INFO
    });

    assert.ok(await dirClient.exists());
  });

  it("directory setMetadata with CPK @loki @sql", async () => {
    await dirClient.create({
      customerProvidedKey: Test_CPK_INFO
    });

    const metadata = {
      a: "a",
      b: "b"
    };
    await dirClient.setMetadata(metadata, {
      customerProvidedKey: Test_CPK_INFO
    });
    const result = await dirClient.getProperties({
      customerProvidedKey: Test_CPK_INFO
    });
    assert.deepStrictEqual(result.metadata, {
      ...metadata,
      hdi_isfolder: "true"
    });
  });

  it("directory setMetadata without cpk to a directory with CPK @loki @sql", async () => {
    await dirClient.create({
      customerProvidedKey: Test_CPK_INFO
    });

    let gotError = false;
    try {
      await dirClient.setMetadata({});
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }
    assert.ok(gotError, "Should got an error");
  });

  it("directory setMetadata with cpk to a directory without CPK @loki @sql", async () => {
    await dirClient.create();

    let gotError = false;
    try {
      await dirClient.setMetadata(
        {},
        {
          customerProvidedKey: Test_CPK_INFO
        }
      );
    } catch (err: any) {
      gotError = true;
      assert.equal((err as any).statusCode, 409);
    }
    assert.ok(gotError, "Should got an error");
  });
});

describe.skip("DataLakePathClient - Encryption Scope", () => {
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
  let encryptionScopeName: string;

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  beforeEach(async function (this: Context) {
    encryptionScopeName = getEncryptionScope();
    fileSystemName = getUniqueName("filesystem");
    fileSystemClient = serviceClient.getFileSystemClient(fileSystemName);
    await fileSystemClient.createIfNotExists({
      fileSystemEncryptionScope: {
        defaultEncryptionScope: encryptionScopeName,
        preventEncryptionScopeOverride: true
      }
    });
  });

  afterEach(async function () {
    await fileSystemClient?.deleteIfExists();
  });

  it("DataLakeFileClient - getProperties should return Encryption Scope @loki @sql", async () => {
    const fileName = getUniqueName("file");
    const fileClient = fileSystemClient.getFileClient(fileName);
    await fileClient.create();
    const result = await fileClient.getProperties();
    assert.equal(result.encryptionScope, encryptionScopeName);
  });

  it("DataLakeDirectoryClient - getProperties should return Encryption Scope @loki @sql", async () => {
    const dirName = getUniqueName("dir");
    const dirClient = fileSystemClient.getDirectoryClient(dirName);
    await dirClient.create();
    const result = await dirClient.getProperties();
    assert.equal(result.encryptionScope, encryptionScopeName);
  });
});
