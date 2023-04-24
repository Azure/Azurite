import { isNode } from "@azure/ms-rest-js";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  DataLakeServiceClient,
  FileSystemListPathsResponse,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-file-datalake";

import { configLogger } from "../../../src/common/Logger";
import { BlobHTTPHeaders } from "../../../src/dfs/generated/artifacts/models";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  sleep,
  upload
} from "../../testutils";

import assert = require("assert");
import BlobTestServerFactory from "../../BlobTestServerFactory";

// Set true to enable debug log
configLogger(false);

describe("fileAPIs", () => {
  const factory = new BlobTestServerFactory(true);
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

  let fileSytemName: string = getUniqueName("filesystem");
  let fileSystemClient = serviceClient.getFileSystemClient(fileSytemName);
  let fileName: string = getUniqueName("file");
  let fileClient = fileSystemClient.getFileClient(fileName);
  let fileLeaseClient = fileClient.getDataLakeLeaseClient();

  let containerClient = blobServiceClient.getContainerClient(fileSytemName);
  let blobClient = containerClient.getBlobClient(fileName);
  blobClient.accountName;

  const content = "Hello World";

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  beforeEach(async () => {
    fileSytemName = getUniqueName("filesystem");
    fileSystemClient = serviceClient.getFileSystemClient(fileSytemName);
    await fileSystemClient.create();
    fileName = getUniqueName("file");
    fileClient = fileSystemClient.getFileClient(fileName);
    fileLeaseClient = fileClient.getDataLakeLeaseClient();
    await upload(fileClient, content);
    containerClient = blobServiceClient.getContainerClient(fileSytemName);
    blobClient = containerClient.getBlobClient(fileName);
  });

  afterEach(async () => {
    await fileSystemClient.delete();
  });

  it("download with with default parameters @loki @sql", async () => {
    const result = await fileClient.read();
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
    assert.equal(result.contentRange, undefined);
    assert.ok(result.requestId);
  });

  it("download should work with conditional headers @loki @sql", async () => {
    const properties = await fileClient.getProperties();
    const result = await fileClient.read(0, undefined, {
      conditions: {
        ifMatch: properties.etag,
        ifNoneMatch: "invalidetag",
        ifModifiedSince: new Date("2018/01/01"),
        ifUnmodifiedSince: new Date("2188/01/01")
      }
    });
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
    assert.equal(result.contentRange, undefined);
    assert.ok(result.requestId);
  });

  it("download should work with ifMatch value * @loki @sql", async () => {
    const result = await fileClient.read(0, undefined, {
      conditions: {
        ifMatch: "*,abc",
        ifNoneMatch: "invalidetag",
        ifModifiedSince: new Date("2018/01/01"),
        ifUnmodifiedSince: new Date("2188/01/01")
      }
    });
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
    assert.equal(result.contentRange, undefined);
    assert.ok(result.requestId);
  });

  it("download should not work with invalid conditional header ifMatch @loki @sql", async () => {
    const properties = await fileClient.getProperties();
    try {
      await fileClient.read(0, undefined, {
        conditions: {
          ifMatch: properties.etag + "invalid"
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("download should not work with conditional header ifNoneMatch @loki @sql", async () => {
    const properties = await fileClient.getProperties();
    try {
      await fileClient.read(0, undefined, {
        conditions: {
          ifNoneMatch: properties.etag
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 304);
      return;
    }
    assert.fail();
  });

  it("download should not work with conditional header ifNoneMatch * @loki @sql", async () => {
    try {
      await fileClient.read(0, undefined, {
        conditions: {
          ifNoneMatch: "*"
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 400);
      return;
    }
    assert.fail();
  });

  it("download should not work with conditional header ifModifiedSince @loki @sql", async () => {
    try {
      await fileClient.read(0, undefined, {
        conditions: {
          ifModifiedSince: new Date("2120/01/01")
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 304);
      return;
    }
    assert.fail();
  });

  it("download should not work with conditional header ifUnmodifiedSince @loki @sql", async () => {
    try {
      await fileClient.read(0, undefined, {
        conditions: {
          ifUnmodifiedSince: new Date("2018/01/01")
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("download all parameters set @loki @sql", async () => {
    const result = await fileClient.read(0, 1, {
      rangeGetContentMD5: true
    });
    assert.deepStrictEqual(await bodyToString(result, 1), content[0]);
    assert.equal(result.contentRange, `bytes 0-0/${content.length}`);
    assert.ok(result.requestId);
  });

  it("download entire with range @loki @sql", async () => {
    const result = await fileClient.read(0, content.length);
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
    assert.equal(
      result.contentRange,
      `bytes 0-${content.length - 1}/${content.length}`
    );
    assert.ok(result.requestId);
  });

  it("download out of range @loki @sql", async () => {
    try {
      await fileClient.read(content.length + 1, content.length + 10);
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 416);
      return;
    }
    assert.fail();
  });

  it("get properties response should not set content-type @loki @sql", async () => {
    const fileURL404 = fileSystemClient.getFileClient("UN_EXIST_file_");
    try {
      await fileURL404.getProperties();
    } catch (err) {
      assert.ok(!err.response.headers.get("content-type"));
    }

    try {
      await fileURL404.read(0, 0);
    } catch (err) {
      assert.notEqual(err.response.headers.get("content-type"), undefined);
    }
  });

  it("delete @loki @sql", async () => {
    const result = await fileClient.delete();
    assert.ok(result.requestId);
  });

  it("delete should work for valid ifMatch @loki @sql", async () => {
    const properties = await fileClient.getProperties();

    const result = await fileClient.delete(false, {
      conditions: {
        ifMatch: properties.etag
      }
    });
    assert.ok(result.requestId);
  });

  it("delete should work for * ifMatch @loki @sql", async () => {
    const result = await fileClient.delete(false, {
      conditions: {
        ifMatch: "*"
      }
    });
    assert.ok(result.requestId);
  });

  it("delete should not work for invalid ifMatch @loki @sql", async () => {
    try {
      await fileClient.delete(false, {
        conditions: {
          ifMatch: "invalid"
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("delete should work for valid ifNoneMatch @loki @sql", async () => {
    const result = await fileClient.delete(false, {
      conditions: {
        ifNoneMatch: "unmatchetag"
      }
    });
    assert.ok(result.requestId);
  });

  it("delete should not work for invalid ifNoneMatch @loki @sql", async () => {
    const properties = await fileClient.getProperties();

    try {
      await fileClient.delete(false, {
        conditions: {
          ifNoneMatch: properties.etag
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("delete should work for ifNoneMatch * @loki @sql", async () => {
    await fileClient.delete(false, {
      conditions: {
        ifNoneMatch: "*"
      }
    });
  });

  it("delete should work for valid ifModifiedSince * @loki @sql", async () => {
    await fileClient.delete(false, {
      conditions: {
        ifModifiedSince: new Date("2018/01/01")
      }
    });
  });

  it("delete should not work for invalid ifModifiedSince @loki @sql", async () => {
    try {
      await fileClient.delete(false, {
        conditions: {
          ifModifiedSince: new Date("2118/01/01")
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("delete should work for valid ifUnmodifiedSince * @loki @sql", async () => {
    await fileClient.delete(false, {
      conditions: {
        ifUnmodifiedSince: new Date("2118/01/01")
      }
    });
  });

  it("delete should not work for invalid ifUnmodifiedSince @loki @sql", async () => {
    try {
      await fileClient.delete(false, {
        conditions: {
          ifUnmodifiedSince: new Date("2018/01/01")
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("should create a snapshot from a file @loki @sql", async () => {
    const result = await blobClient.createSnapshot();
    assert.ok(result.snapshot);
    assert.ok(result.requestId);
  });

  it("should create a snapshot with metadata from a file @loki @sql", async () => {
    const metadata = {
      meta1: "val1",
      meta3: "val3"
    };
    const result = await blobClient.createSnapshot({ metadata });
    assert.ok(result.snapshot);
    assert.ok(result.requestId);
    const result2 = await blobClient
      .withSnapshot(result.snapshot!)
      .getProperties();
    assert.deepStrictEqual(result2.metadata, metadata);
  });

  it("should not delete base file without include snapshot header @loki @sql", async () => {
    const result = await blobClient.createSnapshot();
    assert.ok(result.snapshot);
    assert.ok(result.requestId);
    const fileSnapshotURL = blobClient.withSnapshot(result.snapshot!);
    await fileSnapshotURL.getProperties();

    let err;
    try {
      await fileClient.delete(false, {});
    } catch (error) {
      err = error;
    }

    assert.deepStrictEqual(err.statusCode, 409);
  });

  it("should delete snapshot @loki @sql", async () => {
    const result = await blobClient.createSnapshot();
    assert.ok(result.snapshot);
    assert.ok(result.requestId);
    const fileSnapshotURL = blobClient.withSnapshot(result.snapshot!);
    await fileSnapshotURL.getProperties();
    await fileSnapshotURL.delete();
    await fileClient.delete();
    const result2 = (await fileSystemClient.listPaths().byPage().next())
      .value as FileSystemListPathsResponse;
    // Verify that the snapshot is deleted
    assert.equal(result2.pathItems!.length, 0);
    assert.ok(result2.requestId);
  });

  it("should setMetadata with new metadata set @loki @sql", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };
    const result_setmeta = await fileClient.setMetadata(metadata);
    assert.equal(
      result_setmeta._response.request.headers.get("x-ms-client-request-id"),
      result_setmeta.clientRequestId
    );
    const result = await fileClient.getProperties();
    assert.deepStrictEqual(result.metadata, metadata);
    assert.ok(result.requestId);
  });

  it("acquireLease_available_proposedLeaseId_fixed @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 30;
    fileLeaseClient = fileClient.getDataLakeLeaseClient(guid);
    const result_acquire = await fileLeaseClient.acquireLease(duration);
    assert.equal(
      result_acquire._response.request.headers.get("x-ms-client-request-id"),
      result_acquire._response.request.requestId
    );

    const result = await fileClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
    assert.ok(result.requestId);

    const result_release = await fileLeaseClient.releaseLease();
    assert.equal(
      result_release._response.request.headers.get("x-ms-client-request-id"),
      result_release._response.request.requestId
    );
  });

  it("acquireLease_available_NoproposedLeaseId_infinite @loki @sql", async () => {
    const leaseResult = await fileLeaseClient.acquireLease(-1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const result = await fileClient.getProperties();
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await fileLeaseClient.releaseLease();
  });

  it("releaseLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = -1;
    fileLeaseClient = await fileClient.getDataLakeLeaseClient(guid);
    await fileLeaseClient.acquireLease(duration);

    let result = await fileClient.getProperties();
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await fileLeaseClient.releaseLease();
    result = await fileClient.getProperties();
    assert.equal(result.leaseDuration, undefined);
    assert.equal(result.leaseState, "available");
    assert.equal(result.leaseStatus, "unlocked");
  });

  it("renewLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    fileLeaseClient = await fileClient.getDataLakeLeaseClient(guid);
    await fileLeaseClient.acquireLease(duration);

    const result = await fileClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await sleep(16 * 1000);
    const result2 = await fileClient.getProperties();
    assert.ok(!result2.leaseDuration);
    assert.equal(result2.leaseState, "expired");
    assert.equal(result2.leaseStatus, "unlocked");

    await fileLeaseClient.renewLease();

    const result3 = await fileClient.getProperties();
    assert.equal(result3.leaseDuration, "fixed");
    assert.equal(result3.leaseState, "leased");
    assert.equal(result3.leaseStatus, "locked");

    await fileLeaseClient.releaseLease();
  });

  it("changeLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    fileLeaseClient = fileClient.getDataLakeLeaseClient(guid);
    await fileLeaseClient.acquireLease(duration);

    const result = await fileClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const newGuid = "3c7e72ebb4304526bc53d8ecef03798f";
    const result_change = await fileLeaseClient.changeLease(newGuid);
    assert.equal(
      result_change._response.request.headers.get("x-ms-client-request-id"),
      result_change._response.request.requestId
    );

    await fileClient.getProperties();
    await fileLeaseClient.releaseLease();
  });

  it("breakLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    fileLeaseClient = fileClient.getDataLakeLeaseClient(guid);
    await fileLeaseClient.acquireLease(duration);

    const result = await fileClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const breakDuration = 3;
    let breaklefttime = breakDuration;
    while (breaklefttime > 0) {
      const breakResult = await fileLeaseClient.breakLease(breakDuration);
      assert.equal(
        breakResult._response.request.headers.get("x-ms-client-request-id"),
        breakResult._response.request.requestId
      );

      assert.equal(breakResult.leaseTime! <= breaklefttime, true);
      breaklefttime = breakResult.leaseTime!;

      const result2 = await fileClient.getProperties();
      assert.ok(!result2.leaseDuration);
      assert.equal(result2.leaseState, "breaking");
      assert.equal(result2.leaseStatus, "locked");

      await sleep(500);
    }

    const result3 = await fileClient.getProperties();
    assert.ok(!result3.leaseDuration);
    assert.equal(result3.leaseState, "broken");
    assert.equal(result3.leaseStatus, "unlocked");

    await fileLeaseClient.releaseLease();
    const result4 = await fileClient.getProperties();
    assert.equal(result4.leaseDuration, undefined);
    assert.equal(result4.leaseState, "available");
    assert.equal(result4.leaseStatus, "unlocked");
  });

  it("should get the correct headers back when setting metadata @loki @sql", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };
    const setResult = await fileClient.setMetadata(metadata);
    assert.equal(
      setResult._response.request.headers.get("x-ms-client-request-id"),
      setResult.clientRequestId
    );
    assert.notEqual(setResult.date, undefined);
    assert.notEqual(setResult.etag, undefined);
    assert.notEqual(setResult.isServerEncrypted, undefined);
    assert.notEqual(setResult.lastModified, undefined);
    assert.notEqual(setResult.requestId, undefined);
    assert.notEqual(setResult.version, undefined);
    const result = await fileClient.getProperties();
    assert.deepStrictEqual(result.metadata, metadata);
    assert.deepStrictEqual(result.accessTier, "Hot");
    assert.deepStrictEqual(result.acceptRanges, "bytes");
  });

  // https://docs.microsoft.com/en-us/rest/api/storageservices/get-file-properties
  // as properties retrieval is implemented, the properties should be added to the tests below
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Header
  it("should get the correct properties set based on set HTTP headers @loki @sql", async () => {
    const cacheControl = "no-cache";
    const contentType = "text/plain; charset=UTF-8";
    const md5 = new Uint8Array([1, 2, 3, 4, 5]);
    const contentEncoding = "identity";
    const contentLanguage = "en-US";
    const contentDisposition = "attachment";
    const headers: BlobHTTPHeaders = {
      blobCacheControl: cacheControl,
      blobContentType: contentType,
      blobContentMD5: md5,
      blobContentDisposition: contentDisposition,
      blobContentLanguage: contentLanguage,
      blobContentEncoding: contentEncoding
    };
    const result_set = await blobClient.setHTTPHeaders(headers);
    assert.equal(
      result_set._response.request.headers.get("x-ms-client-request-id"),
      result_set.clientRequestId
    );
    const result = await fileClient.getProperties();
    assert.deepStrictEqual(result.cacheControl, cacheControl);
    assert.deepStrictEqual(result.contentType, contentType);
    assert.deepEqual(result.contentMD5, md5);
    assert.deepStrictEqual(result.contentDisposition, contentDisposition);
    assert.deepStrictEqual(result.contentLanguage, contentLanguage);
  });

  it("setHTTPHeaders with default parameters @loki @sql", async () => {
    await blobClient.setHTTPHeaders({});
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

  it("setHTTPHeaders with all parameters set @loki @sql", async () => {
    const headers: BlobHTTPHeaders = {
      blobCacheControl: "fileCacheControl",
      blobContentDisposition: "fileContentDisposition",
      blobContentEncoding: "fileContentEncoding",
      blobContentLanguage: "fileContentLanguage",
      blobContentMD5: isNode
        ? Buffer.from([1, 2, 3, 4])
        : new Uint8Array([1, 2, 3, 4]),
      blobContentType: "fileContentType"
    };
    await blobClient.setHTTPHeaders(headers);
    const result = await fileClient.getProperties();
    assert.ok(result.date);
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, {});
    assert.deepStrictEqual(result.cacheControl, headers.blobCacheControl);
    assert.deepStrictEqual(result.contentType, headers.blobContentType);
    assert.deepStrictEqual(result.contentMD5, headers.blobContentMD5);
    assert.deepStrictEqual(result.contentEncoding, headers.blobContentEncoding);
    assert.deepStrictEqual(result.contentLanguage, headers.blobContentLanguage);
    assert.deepStrictEqual(
      result.contentDisposition,
      headers.blobContentDisposition
    );
  });

  it("Copy file should work @loki @sql", async () => {
    const sourcefile = getUniqueName("file");
    const destfile = getUniqueName("file");

    const sourceBlobClient = containerClient.getBlobClient(sourcefile);
    const destBlobClient = containerClient.getBlobClient(destfile);
    const sourceFileClient = fileSystemClient.getFileClient(sourcefile);
    const destfileClient = fileSystemClient.getFileClient(destfile);

    const metadata = { key: "value" };
    const pathHttpHeaders = {
      cacheControl: "fileCacheControl",
      contentDisposition: "fileContentDisposition",
      contentEncoding: "fileContentEncoding",
      contentLanguage: "fileContentLanguage",
      contentType: "fileContentType"
    };

    await upload(sourceFileClient, "hello", { pathHttpHeaders, metadata });

    const result_startcopy = await destBlobClient.beginCopyFromURL(
      sourceBlobClient.url
    );
    assert.equal(
      result_startcopy
        .getResult()!
        ._response.request.headers.get("x-ms-client-request-id"),
      result_startcopy.getResult()!._response.request.requestId
    );

    const result = await destfileClient.getProperties();
    assert.ok(result.date);
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata);
    assert.deepStrictEqual(result.cacheControl, pathHttpHeaders.cacheControl);
    assert.deepStrictEqual(result.contentType, pathHttpHeaders.contentType);
    assert.deepStrictEqual(
      result.contentEncoding,
      pathHttpHeaders.contentEncoding
    );
    assert.deepStrictEqual(
      result.contentLanguage,
      pathHttpHeaders.contentLanguage
    );
    assert.deepStrictEqual(
      result.contentDisposition,
      pathHttpHeaders.contentDisposition
    );
  });

  it("Copy file should work to override metadata @loki @sql", async () => {
    const sourcefile = getUniqueName("file");
    const destfile = getUniqueName("file");

    const sourceBlobClient = containerClient.getBlobClient(sourcefile);
    const destBlobClient = containerClient.getBlobClient(destfile);
    const sourceFileClient = fileSystemClient.getFileClient(sourcefile);
    const destfileClient = fileSystemClient.getFileClient(destfile);

    const metadata = { key: "value" };
    const metadata2 = { key: "value2" };

    await upload(sourceFileClient, "hello", { metadata });

    await destBlobClient.beginCopyFromURL(sourceBlobClient.url, {
      metadata: metadata2
    });

    const result = await destfileClient.getProperties();
    assert.ok(result.date);
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata2);
  });

  it("Copy file should not override destination Lease status @loki @sql", async () => {
    const sourcefile = getUniqueName("file");
    const destfile = getUniqueName("file");

    const sourceBlobClient = containerClient.getBlobClient(sourcefile);
    const destBlobClient = containerClient.getBlobClient(destfile);
    const sourceFileClient = fileSystemClient.getFileClient(sourcefile);
    const destfileClient = fileSystemClient.getFileClient(destfile);

    await upload(sourceFileClient, "hello");
    await upload(destfileClient, "hello");

    let destLeaseClient = destfileClient.getDataLakeLeaseClient();
    const leaseResult = await destLeaseClient.acquireLease(-1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const getResult = await destfileClient.getProperties();
    assert.equal(getResult.leaseDuration, "infinite");
    assert.equal(getResult.leaseState, "leased");
    assert.equal(getResult.leaseStatus, "locked");

    await destBlobClient.beginCopyFromURL(sourceBlobClient.url, {
      conditions: { leaseId }
    });

    const result = await destfileClient.getProperties();
    assert.ok(result.date);
    assert.ok(result.lastModified);
    assert.equal(getResult.leaseDuration, "infinite");
    assert.equal(getResult.leaseState, "leased");
    assert.equal(getResult.leaseStatus, "locked");

    await destLeaseClient.releaseLease();
  });

  it("Copy file should not work with  ifNoneMatch * when dest exist @loki @sql", async () => {
    const sourcefile = getUniqueName("file");
    const destfile = getUniqueName("file");

    const sourceBlobClient = containerClient.getBlobClient(sourcefile);
    const destBlobClient = containerClient.getBlobClient(destfile);
    const sourceFileClient = fileSystemClient.getFileClient(sourcefile);
    const destfileClient = fileSystemClient.getFileClient(destfile);

    const metadata = { key: "value" };
    const pathHttpHeaders = {
      cacheControl: "fileCacheControl",
      contentDisposition: "fileContentDisposition",
      contentEncoding: "fileContentEncoding",
      contentLanguage: "fileContentLanguage",
      contentType: "fileContentType"
    };

    let uploadResult = await sourceFileClient.create({
      pathHttpHeaders,
      metadata
    });
    assert.ok(uploadResult.requestId);
    await upload(sourceFileClient, "hello");
    await upload(destfileClient, "hello", { pathHttpHeaders, metadata });

    // async copy
    try {
      await destBlobClient.beginCopyFromURL(sourceBlobClient.url, {
        conditions: {
          ifNoneMatch: "*"
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 409);
      return;
    }
    assert.fail();

    // Sync copy
    try {
      await destBlobClient.syncCopyFromURL(sourceBlobClient.url, {
        conditions: {
          ifNoneMatch: "*"
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 409);
      return;
    }
    assert.fail();
  });

  it("Synchronized copy file should work @loki @sql", async () => {
    const sourcefile = getUniqueName("file");
    const destfile = getUniqueName("file");

    const sourceBlobClient = containerClient.getBlobClient(sourcefile);
    const destBlobClient = containerClient.getBlobClient(destfile);
    const sourceFileClient = fileSystemClient.getFileClient(sourcefile);
    const destfileClient = fileSystemClient.getFileClient(destfile);

    const metadata = { key: "value" };
    const pathHttpHeaders = {
      cacheControl: "fileCacheControl",
      contentDisposition: "fileContentDisposition",
      contentEncoding: "fileContentEncoding",
      contentLanguage: "fileContentLanguage",
      contentType: "fileContentType"
    };

    await upload(sourceFileClient, "hello", { pathHttpHeaders, metadata });
    const result_copy = await destBlobClient.syncCopyFromURL(
      sourceBlobClient.url
    );
    assert.equal(
      result_copy._response.request.headers.get("x-ms-client-request-id"),
      result_copy._response.request.requestId
    );
    assert.equal(result_copy.copyStatus, "success");

    const result = await destfileClient.getProperties();
    assert.ok(result.date);
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata);
    assert.deepStrictEqual(result.cacheControl, pathHttpHeaders.cacheControl);
    assert.deepStrictEqual(result.contentType, pathHttpHeaders.contentType);
    assert.deepStrictEqual(
      result.contentEncoding,
      pathHttpHeaders.contentEncoding
    );
    assert.deepStrictEqual(
      result.contentLanguage,
      pathHttpHeaders.contentLanguage
    );
    assert.deepStrictEqual(
      result.contentDisposition,
      pathHttpHeaders.contentDisposition
    );
  });

  it("Synchronized copy file should work to override metadata @loki @sql", async () => {
    const sourcefile = getUniqueName("file");
    const destfile = getUniqueName("file");

    const sourceBlobClient = containerClient.getBlobClient(sourcefile);
    const destBlobClient = containerClient.getBlobClient(destfile);
    const sourceFileClient = fileSystemClient.getFileClient(sourcefile);
    const destfileClient = fileSystemClient.getFileClient(destfile);

    const metadata = { key: "value" };
    const metadata2 = { key: "value2" };

    const pathHttpHeaders = {
      cacheControl: "fileCacheControl",
      contentDisposition: "fileContentDisposition",
      contentEncoding: "fileContentEncoding",
      contentLanguage: "fileContentLanguage",
      contentType: "fileContentType"
    };

    await upload(sourceFileClient, "hello", { pathHttpHeaders, metadata });
    await destBlobClient.syncCopyFromURL(sourceBlobClient.url, {
      metadata: metadata2
    });

    const result = await destfileClient.getProperties();
    assert.ok(result.date);
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata2);
  });

  it("Synchronized copy file should not override destination Lease status @loki @sql", async () => {
    const sourcefile = getUniqueName("file");
    const destfile = getUniqueName("file");

    const sourceBlobClient = containerClient.getBlobClient(sourcefile);
    const destBlobClient = containerClient.getBlobClient(destfile);
    const sourceFileClient = fileSystemClient.getFileClient(sourcefile);
    const destfileClient = fileSystemClient.getFileClient(destfile);

    await upload(sourceFileClient, "hello");
    await upload(destfileClient, "hello");

    let destLeaseClient = destfileClient.getDataLakeLeaseClient();
    const leaseResult = await destLeaseClient.acquireLease(-1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const getResult = await destfileClient.getProperties();
    assert.equal(getResult.leaseDuration, "infinite");
    assert.equal(getResult.leaseState, "leased");
    assert.equal(getResult.leaseStatus, "locked");

    await destBlobClient.syncCopyFromURL(sourceBlobClient.url, {
      conditions: { leaseId }
    });

    const result = await destfileClient.getProperties();
    assert.ok(result.date);
    assert.ok(result.lastModified);
    assert.equal(getResult.leaseDuration, "infinite");
    assert.equal(getResult.leaseState, "leased");
    assert.equal(getResult.leaseStatus, "locked");

    await destLeaseClient.releaseLease();
  });

  it("Synchronized copy file should work for page file @loki @sql", async () => {
    const sourcefile = getUniqueName("file");
    const destfile = getUniqueName("file");

    const sourceBlobClient = containerClient.getBlobClient(sourcefile);
    const destBlobClient = containerClient.getBlobClient(destfile);
    const sourceFileClient = fileSystemClient.getFileClient(sourcefile);
    const destfileClient = fileSystemClient.getFileClient(destfile);

    const metadata = { key: "value" };

    const pathHttpHeaders = {
      cacheControl: "fileCacheControl",
      contentDisposition: "fileContentDisposition",
      contentEncoding: "fileContentEncoding",
      contentLanguage: "fileContentLanguage",
      contentType: "fileContentType"
    };

    await upload(sourceFileClient, "hello", { pathHttpHeaders, metadata });
    const result_copy = await destBlobClient.syncCopyFromURL(
      sourceBlobClient.url
    );
    assert.equal(
      result_copy._response.request.headers.get("x-ms-client-request-id"),
      result_copy._response.request.requestId
    );
    assert.equal(result_copy.copyStatus, "success");

    const result = await destfileClient.getProperties();
    assert.ok(result.date);
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata);
    assert.deepStrictEqual(result.cacheControl, pathHttpHeaders.cacheControl);
    assert.deepStrictEqual(result.contentType, pathHttpHeaders.contentType);
    assert.deepStrictEqual(
      result.contentEncoding,
      pathHttpHeaders.contentEncoding
    );
    assert.deepStrictEqual(
      result.contentLanguage,
      pathHttpHeaders.contentLanguage
    );
    assert.deepStrictEqual(
      result.contentDisposition,
      pathHttpHeaders.contentDisposition
    );
  });

  it("Acquire Lease on Breaking Lease status, if LeaseId not match, throw LeaseIdMismatchWithLease error @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Renew Lease on Breaking Lease status, if LeaseId not match, throw LeaseIdMismatchWithLease error @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Change Lease on Breaking Lease status, if LeaseId not match, throw LeaseIdMismatchWithLease error @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Renew: Lease on Breaking Lease status, if LeaseId not match, throw LeaseIdMismatchWithLease error @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Acquire Lease on Broken Lease status, if LeaseId not match, throw LeaseIdMismatchWithLease error @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Break Lease on Infinite Lease, if give valid breakPeriod, should be broken after breadperiod @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Break Lease on Infinite Lease, if not give breakPeriod, should be broken immidiately @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Renew: Lease on Leased status, if LeaseId not match, throw LeaseIdMismatchWithLease error @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Change Lease on Leased status, if input LeaseId not match anyone of leaseID or proposedLeaseId, throw LeaseIdMismatchWithLease error @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Change Lease on Leased status, if input LeaseId matches proposedLeaseId, will change success @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("UploadPage on a Leased page file, if input LeaseId matches, will success @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("ClearPage on a Leased page file, if input LeaseId matches, will success @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Resize a Leased page file, if input LeaseId matches, will success @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("UpdateSequenceNumber a Leased page file, if input LeaseId matches, will success @loki @sql", async () => {
    // TODO: implement the case later
  });
});
