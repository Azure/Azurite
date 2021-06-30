import { isNode } from "@azure/ms-rest-js";
import {
  StorageSharedKeyCredential,
  newPipeline,
  BlobServiceClient
} from "@azure/storage-blob";
import assert = require("assert");

import { BlobHTTPHeaders } from "../../../src/blob/generated/artifacts/models";
import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  sleep
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("BlobAPIs", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();

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
  let blobLeaseClient = blobClient.getBlobLeaseClient();
  const content = "Hello World";

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
    blobLeaseClient = blobClient.getBlobLeaseClient();
    await blockBlobClient.upload(content, content.length);
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  it("download with with default parameters @loki @sql", async () => {
    const result = await blobClient.download(0);
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
    assert.equal(result.contentRange, undefined);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("download should work with conditional headers @loki @sql", async () => {
    const properties = await blobClient.getProperties();
    const result = await blobClient.download(0, undefined, {
      conditions: {
        ifMatch: properties.etag,
        ifNoneMatch: "invalidetag",
        ifModifiedSince: new Date("2018/01/01"),
        ifUnmodifiedSince: new Date("2188/01/01")
      }
    });
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
    assert.equal(result.contentRange, undefined);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("download should work with ifMatch value * @loki @sql", async () => {
    const result = await blobClient.download(0, undefined, {
      conditions: {
        ifMatch: "*,abc",
        ifNoneMatch: "invalidetag",
        ifModifiedSince: new Date("2018/01/01"),
        ifUnmodifiedSince: new Date("2188/01/01")
      }
    });
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
    assert.equal(result.contentRange, undefined);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("download should not work with invalid conditional header ifMatch @loki @sql", async () => {
    const properties = await blobClient.getProperties();
    try {
      await blobClient.download(0, undefined, {
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
    const properties = await blobClient.getProperties();
    try {
      await blobClient.download(0, undefined, {
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
      await blobClient.download(0, undefined, {
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
      await blobClient.download(0, undefined, {
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
      await blobClient.download(0, undefined, {
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
    const result = await blobClient.download(0, 1, {
      rangeGetContentMD5: true
    });
    assert.deepStrictEqual(await bodyToString(result, 1), content[0]);
    assert.equal(result.contentRange, `bytes 0-0/${content.length}`);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("download entire with range @loki @sql", async () => {
    const result = await blobClient.download(0, content.length);
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
    assert.equal(
      result.contentRange,
      `bytes 0-${content.length - 1}/${content.length}`
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("get properties response should not set content-type @loki @sql", async () => {
    const blobURL404 = containerClient.getBlobClient("UN_EXIST_BLOB_");
    try {
      await blobURL404.getProperties();
    } catch (err) {
      assert.ok(!err.response.headers.get("content-type"));
    }

    try {
      await blobURL404.download(0, 0);
    } catch (err) {
      assert.notEqual(err.response.headers.get("content-type"), undefined);
    }
  });

  it("delete @loki @sql", async () => {
    const result = await blobClient.delete();
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("delete should work for valid ifMatch @loki @sql", async () => {
    const properties = await blobClient.getProperties();

    const result = await blobClient.delete({
      conditions: {
        ifMatch: properties.etag
      }
    });
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("delete should work for * ifMatch @loki @sql", async () => {
    const result = await blobClient.delete({
      conditions: {
        ifMatch: "*"
      }
    });
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("delete should not work for invalid ifMatch @loki @sql", async () => {
    try {
      await blobClient.delete({
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
    const result = await blobClient.delete({
      conditions: {
        ifNoneMatch: "unmatchetag"
      }
    });
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("delete should not work for invalid ifNoneMatch @loki @sql", async () => {
    const properties = await blobClient.getProperties();

    try {
      await blobClient.delete({
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
    await blobClient.delete({
      conditions: {
        ifNoneMatch: "*"
      }
    });
  });

  it("delete should work for valid ifModifiedSince * @loki @sql", async () => {
    await blobClient.delete({
      conditions: {
        ifModifiedSince: new Date("2018/01/01")
      }
    });
  });

  it("delete should not work for invalid ifModifiedSince @loki @sql", async () => {
    try {
      await blobClient.delete({
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
    await blobClient.delete({
      conditions: {
        ifUnmodifiedSince: new Date("2118/01/01")
      }
    });
  });

  it("delete should not work for invalid ifUnmodifiedSince @loki @sql", async () => {
    try {
      await blobClient.delete({
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

  it("should create a snapshot from a blob @loki @sql", async () => {
    const result = await blobClient.createSnapshot();
    assert.ok(result.snapshot);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("should create a snapshot with metadata from a blob @loki @sql", async () => {
    const metadata = {
      meta1: "val1",
      meta3: "val3"
    };
    const result = await blobClient.createSnapshot({ metadata });
    assert.ok(result.snapshot);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
    const result2 = await blobClient
      .withSnapshot(result.snapshot!)
      .getProperties();
    assert.deepStrictEqual(result2.metadata, metadata);
  });

  it("should not delete base blob without include snapshot header @loki @sql", async () => {
    const result = await blobClient.createSnapshot();
    assert.ok(result.snapshot);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
    const blobSnapshotURL = blobClient.withSnapshot(result.snapshot!);
    await blobSnapshotURL.getProperties();

    let err;
    try {
      await blobClient.delete({});
    } catch (error) {
      err = error;
    }

    assert.deepStrictEqual(err.statusCode, 409);
  });

  it("should delete snapshot @loki @sql", async () => {
    const result = await blobClient.createSnapshot();
    assert.ok(result.snapshot);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
    const blobSnapshotURL = blobClient.withSnapshot(result.snapshot!);
    await blobSnapshotURL.getProperties();
    await blobSnapshotURL.delete();
    await blobClient.delete();
    const result2 = (
      await containerClient
        .listBlobsFlat({
          includeSnapshots: true
        })
        .byPage()
        .next()
    ).value;
    // Verify that the snapshot is deleted
    assert.equal(result2.segment.blobItems!.length, 0);
    assert.equal(
      result2._response.request.headers.get("x-ms-client-request-id"),
      result2.clientRequestId
    );
  });

  it("should also list snapshots @loki @sql", async () => {
    const result = await blobClient.createSnapshot();
    assert.ok(result.snapshot);
    const result2 = (
      await containerClient
        .listBlobsFlat({ includeSnapshots: true })
        .byPage()
        .next()
    ).value;
    assert.strictEqual(result2.segment.blobItems!.length, 2);
  });

  it("should setMetadata with new metadata set @loki @sql", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };
    const result_setmeta = await blobClient.setMetadata(metadata);
    assert.equal(
      result_setmeta._response.request.headers.get("x-ms-client-request-id"),
      result_setmeta.clientRequestId
    );
    const result = await blobClient.getProperties();
    assert.deepStrictEqual(result.metadata, metadata);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("acquireLease_available_proposedLeaseId_fixed @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 30;
    blobLeaseClient = await blobClient.getBlobLeaseClient(guid);
    const result_acquire = await blobLeaseClient.acquireLease(duration);
    assert.equal(
      result_acquire._response.request.headers.get("x-ms-client-request-id"),
      result_acquire._response.request.requestId
    );

    const result = await blobClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const result_release = await blobLeaseClient.releaseLease();
    assert.equal(
      result_release._response.request.headers.get("x-ms-client-request-id"),
      result_release._response.request.requestId
    );
  });

  it("acquireLease_available_NoproposedLeaseId_infinite @loki @sql", async () => {
    const leaseResult = await blobLeaseClient.acquireLease(-1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const result = await blobClient.getProperties();
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await blobLeaseClient.releaseLease();
  });

  it("releaseLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = -1;
    blobLeaseClient = await blobClient.getBlobLeaseClient(guid);
    await blobLeaseClient.acquireLease(duration);

    let result = await blobClient.getProperties();
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await blobLeaseClient.releaseLease();
    result = await blobClient.getProperties();
    assert.equal(result.leaseDuration, undefined);
    assert.equal(result.leaseState, "available");
    assert.equal(result.leaseStatus, "unlocked");
  });

  it("renewLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    blobLeaseClient = await blobClient.getBlobLeaseClient(guid);
    await blobLeaseClient.acquireLease(duration);

    const result = await blobClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await sleep(16 * 1000);
    const result2 = await blobClient.getProperties();
    assert.ok(!result2.leaseDuration);
    assert.equal(result2.leaseState, "expired");
    assert.equal(result2.leaseStatus, "unlocked");

    await blobLeaseClient.renewLease();

    const result3 = await blobClient.getProperties();
    assert.equal(result3.leaseDuration, "fixed");
    assert.equal(result3.leaseState, "leased");
    assert.equal(result3.leaseStatus, "locked");

    await blobLeaseClient.releaseLease();
  });

  it("changeLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    blobLeaseClient = blobClient.getBlobLeaseClient(guid);
    await blobLeaseClient.acquireLease(duration);

    const result = await blobClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const newGuid = "3c7e72ebb4304526bc53d8ecef03798f";
    const result_change = await blobLeaseClient.changeLease(newGuid);
    assert.equal(
      result_change._response.request.headers.get("x-ms-client-request-id"),
      result_change._response.request.requestId
    );

    await blobClient.getProperties();
    await blobLeaseClient.releaseLease();
  });

  it("breakLease @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    blobLeaseClient = blobClient.getBlobLeaseClient(guid);
    await blobLeaseClient.acquireLease(duration);

    const result = await blobClient.getProperties();
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const breakDuration = 3;
    let breaklefttime = breakDuration;
    while (breaklefttime > 0) {
      const breakResult = await blobLeaseClient.breakLease(breakDuration);
      assert.equal(
        breakResult._response.request.headers.get("x-ms-client-request-id"),
        breakResult._response.request.requestId
      );

      assert.equal(breakResult.leaseTime! <= breaklefttime, true);
      breaklefttime = breakResult.leaseTime!;

      const result2 = await blobClient.getProperties();
      assert.ok(!result2.leaseDuration);
      assert.equal(result2.leaseState, "breaking");
      assert.equal(result2.leaseStatus, "locked");

      await sleep(500);
    }

    const result3 = await blobClient.getProperties();
    assert.ok(!result3.leaseDuration);
    assert.equal(result3.leaseState, "broken");
    assert.equal(result3.leaseStatus, "unlocked");

    await blobLeaseClient.releaseLease();
    const result4 = await blobClient.getProperties();
    assert.equal(result4.leaseDuration, undefined);
    assert.equal(result4.leaseState, "available");
    assert.equal(result4.leaseStatus, "unlocked");
  });

  it("should get the correct headers back when setting metadata @loki @sql", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };
    const setResult = await blobClient.setMetadata(metadata);
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
    const result = await blobClient.getProperties();
    assert.deepStrictEqual(result.metadata, metadata);
    assert.deepStrictEqual(result.accessTier, "Hot");
    assert.deepStrictEqual(result.acceptRanges, "bytes");
    assert.deepStrictEqual(result.blobType, "BlockBlob");
  });

  // https://docs.microsoft.com/en-us/rest/api/storageservices/get-blob-properties
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
    const result = await blobClient.getProperties();
    assert.deepStrictEqual(result.cacheControl, cacheControl);
    assert.deepStrictEqual(result.contentType, contentType);
    assert.deepEqual(result.contentMD5, md5);
    assert.deepStrictEqual(result.contentDisposition, contentDisposition);
    assert.deepStrictEqual(result.contentLanguage, contentLanguage);
  });

  it("setTier set default to cool @loki @sql", async () => {
    // Created Blob should have accessTierInferred as true in Get/list
    let properties = await blockBlobClient.getProperties();
    assert.equal(properties.accessTier!.toLowerCase(), "hot");
    assert.equal(true, properties.accessTierInferred);

    let listResult = (
      await containerClient
        .listBlobsFlat({
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.equal(
      true,
      (await listResult).segment.blobItems[0].properties.accessTierInferred
    );

    const result = await blockBlobClient.setAccessTier("Cool");
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    // After setTier, Blob should have accessTierInferred as false in Get
    properties = await blockBlobClient.getProperties();
    assert.equal(properties.accessTier!.toLowerCase(), "cool");
    assert.equal(false, properties.accessTierInferred);

    // After setTier, Blob should have accessTierInferred as undefined in list
    listResult = (
      await containerClient
        .listBlobsFlat({
          prefix: blobName
        })
        .byPage()
        .next()
    ).value;
    assert.equal(
      undefined,
      (await listResult).segment.blobItems[0].properties.accessTierInferred
    );
  });

  it("setTier set archive to hot @loki @sql", async () => {
    await blockBlobClient.setAccessTier("Archive");
    let properties = await blockBlobClient.getProperties();
    assert.equal(properties.accessTier!.toLowerCase(), "archive");

    await blockBlobClient.setAccessTier("Hot");
    properties = await blockBlobClient.getProperties();
    if (properties.archiveStatus) {
      assert.equal(
        properties.archiveStatus.toLowerCase(),
        "rehydrate-pending-to-hot"
      );
    }
  });

  it("setTier on leased blob @loki @sql", async () => {
    const leaseResult = await blobLeaseClient.acquireLease(-1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    await blockBlobClient.setAccessTier("Hot", {
      conditions: { leaseId: leaseId }
    });

    const result = await blobClient.getProperties();
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
    if (result.archiveStatus) {
      assert.equal(
        result.archiveStatus.toLowerCase(),
        "rehydrate-pending-to-hot"
      );
    }

    await blobLeaseClient.releaseLease();

    await blockBlobClient.setAccessTier("Archive");
    let properties = await blockBlobClient.getProperties();
    assert.equal(properties.accessTier!.toLowerCase(), "archive");

    await blockBlobClient.setAccessTier("Hot");
    properties = await blockBlobClient.getProperties();
    if (properties.archiveStatus) {
      assert.equal(
        properties.archiveStatus.toLowerCase(),
        "rehydrate-pending-to-hot"
      );
    }
  });

  it("setHTTPHeaders with default parameters @loki @sql", async () => {
    await blobClient.setHTTPHeaders({});
    const result = await blobClient.getProperties();

    assert.deepStrictEqual(result.blobType, "BlockBlob");
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
    const headers = {
      blobCacheControl: "blobCacheControl",
      blobContentDisposition: "blobContentDisposition",
      blobContentEncoding: "blobContentEncoding",
      blobContentLanguage: "blobContentLanguage",
      blobContentMD5: isNode
        ? Buffer.from([1, 2, 3, 4])
        : new Uint8Array([1, 2, 3, 4]),
      blobContentType: "blobContentType"
    };
    await blobClient.setHTTPHeaders(headers);
    const result = await blobClient.getProperties();
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "BlockBlob");
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

  it("Copy blob should work @loki", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getBlockBlobClient(sourceBlob);
    const destBlobClient = containerClient.getBlockBlobClient(destBlob);

    const metadata = { key: "value" };
    const blobHTTPHeaders = {
      blobCacheControl: "blobCacheControl",
      blobContentDisposition: "blobContentDisposition",
      blobContentEncoding: "blobContentEncoding",
      blobContentLanguage: "blobContentLanguage",
      blobContentType: "blobContentType"
    };

    const result_upload = await sourceBlobClient.upload("hello", 5, {
      metadata,
      blobHTTPHeaders
    });
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );

    const result_startcopy = await destBlobClient.beginCopyFromURL(
      sourceBlobClient.url
    );
    assert.equal(
      result_startcopy
        .getResult()!
        ._response.request.headers.get("x-ms-client-request-id"),
      result_startcopy.getResult()!._response.request.requestId
    );

    const result = await destBlobClient.getProperties();
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "BlockBlob");
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata);
    assert.deepStrictEqual(
      result.cacheControl,
      blobHTTPHeaders.blobCacheControl
    );
    assert.deepStrictEqual(result.contentType, blobHTTPHeaders.blobContentType);
    assert.deepStrictEqual(
      result.contentEncoding,
      blobHTTPHeaders.blobContentEncoding
    );
    assert.deepStrictEqual(
      result.contentLanguage,
      blobHTTPHeaders.blobContentLanguage
    );
    assert.deepStrictEqual(
      result.contentDisposition,
      blobHTTPHeaders.blobContentDisposition
    );
  });

  it("Copy blob should work to override metadata @loki", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getBlockBlobClient(sourceBlob);
    const destBlobClient = containerClient.getBlockBlobClient(destBlob);

    const metadata = { key: "value" };
    const metadata2 = { key: "value2" };
    await sourceBlobClient.upload("hello", 5, {
      metadata
    });

    await destBlobClient.beginCopyFromURL(sourceBlobClient.url, {
      metadata: metadata2
    });

    const result = await destBlobClient.getProperties();
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "BlockBlob");
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata2);
  });

  it("Copy blob should not override destination Lease status @loki", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getBlockBlobClient(sourceBlob);
    const destBlobClient = containerClient.getBlockBlobClient(destBlob);

    await sourceBlobClient.upload("hello", 5);
    await destBlobClient.upload("hello", 5);

    let destLeaseClient = destBlobClient.getBlobLeaseClient();
    const leaseResult = await destLeaseClient.acquireLease(-1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const getResult = await destBlobClient.getProperties();
    assert.equal(getResult.leaseDuration, "infinite");
    assert.equal(getResult.leaseState, "leased");
    assert.equal(getResult.leaseStatus, "locked");

    await destBlobClient.beginCopyFromURL(sourceBlobClient.url, {
      conditions: { leaseId }
    });

    const result = await destBlobClient.getProperties();
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "BlockBlob");
    assert.ok(result.lastModified);
    assert.equal(getResult.leaseDuration, "infinite");
    assert.equal(getResult.leaseState, "leased");
    assert.equal(getResult.leaseStatus, "locked");

    await destLeaseClient.releaseLease();
  });

  it("Copy blob should work for page blob @loki", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getPageBlobClient(sourceBlob);
    const destBlobClient = containerClient.getPageBlobClient(destBlob);

    const metadata = { key: "value" };
    const blobHTTPHeaders = {
      blobCacheControl: "blobCacheControl",
      blobContentDisposition: "blobContentDisposition",
      blobContentEncoding: "blobContentEncoding",
      blobContentLanguage: "blobContentLanguage",
      blobContentType: "blobContentType"
    };

    const result_upload = await sourceBlobClient.create(512, {
      metadata,
      blobHTTPHeaders
    });
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );

    const result_startcopy = await destBlobClient.beginCopyFromURL(
      sourceBlobClient.url
    );
    assert.equal(
      result_startcopy
        .getResult()!
        ._response.request.headers.get("x-ms-client-request-id"),
      result_startcopy.getResult()!._response.request.requestId
    );

    const result = await destBlobClient.getProperties();
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "PageBlob");
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata);
    assert.deepStrictEqual(
      result.cacheControl,
      blobHTTPHeaders.blobCacheControl
    );
    assert.deepStrictEqual(result.contentType, blobHTTPHeaders.blobContentType);
    assert.deepStrictEqual(
      result.contentEncoding,
      blobHTTPHeaders.blobContentEncoding
    );
    assert.deepStrictEqual(
      result.contentLanguage,
      blobHTTPHeaders.blobContentLanguage
    );
    assert.deepStrictEqual(
      result.contentDisposition,
      blobHTTPHeaders.blobContentDisposition
    );
  });

  it("Copy blob should not work for page blob and set tier @loki", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getPageBlobClient(sourceBlob);
    const destBlobClient = containerClient.getPageBlobClient(destBlob);

    const metadata = { key: "value" };
    const blobHTTPHeaders = {
      blobCacheControl: "blobCacheControl",
      blobContentDisposition: "blobContentDisposition",
      blobContentEncoding: "blobContentEncoding",
      blobContentLanguage: "blobContentLanguage",
      blobContentType: "blobContentType"
    };

    const result_upload = await sourceBlobClient.create(512, {
      metadata,
      blobHTTPHeaders
    });
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );

    let err;

    try {
      await destBlobClient.beginCopyFromURL(sourceBlobClient.url, {
        tier: "P10"
      });
    } catch (error) {
      err = error;
    }

    assert.deepStrictEqual(err.statusCode, 400);
  });

  it("Synchronized copy blob should work @loki", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getBlockBlobClient(sourceBlob);
    const destBlobClient = containerClient.getBlockBlobClient(destBlob);

    const metadata = { key: "value" };
    const blobHTTPHeaders = {
      blobCacheControl: "blobCacheControl",
      blobContentDisposition: "blobContentDisposition",
      blobContentEncoding: "blobContentEncoding",
      blobContentLanguage: "blobContentLanguage",
      blobContentType: "blobContentType"
    };

    const result_upload = await sourceBlobClient.upload("hello", 5, {
      metadata,
      blobHTTPHeaders
    });
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );

    const result_copy = await destBlobClient.syncCopyFromURL(
      sourceBlobClient.url
    );
    assert.equal(
      result_copy._response.request.headers.get("x-ms-client-request-id"),
      result_copy._response.request.requestId
    );
    assert.equal(result_copy.copyStatus, "success");

    const result = await destBlobClient.getProperties();
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "BlockBlob");
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata);
    assert.deepStrictEqual(
      result.cacheControl,
      blobHTTPHeaders.blobCacheControl
    );
    assert.deepStrictEqual(result.contentType, blobHTTPHeaders.blobContentType);
    assert.deepStrictEqual(
      result.contentEncoding,
      blobHTTPHeaders.blobContentEncoding
    );
    assert.deepStrictEqual(
      result.contentLanguage,
      blobHTTPHeaders.blobContentLanguage
    );
    assert.deepStrictEqual(
      result.contentDisposition,
      blobHTTPHeaders.blobContentDisposition
    );
  });

  it("Synchronized copy blob should work to override metadata @loki", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getBlockBlobClient(sourceBlob);
    const destBlobClient = containerClient.getBlockBlobClient(destBlob);

    const metadata = { key: "value" };
    const metadata2 = { key: "value2" };
    await sourceBlobClient.upload("hello", 5, {
      metadata
    });

    await destBlobClient.syncCopyFromURL(sourceBlobClient.url, {
      metadata: metadata2
    });

    const result = await destBlobClient.getProperties();
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "BlockBlob");
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata2);
  });

  it("Synchronized copy blob should not override destination Lease status @loki", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getBlockBlobClient(sourceBlob);
    const destBlobClient = containerClient.getBlockBlobClient(destBlob);

    await sourceBlobClient.upload("hello", 5);
    await destBlobClient.upload("hello", 5);

    let destLeaseClient = destBlobClient.getBlobLeaseClient();
    const leaseResult = await destLeaseClient.acquireLease(-1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const getResult = await destBlobClient.getProperties();
    assert.equal(getResult.leaseDuration, "infinite");
    assert.equal(getResult.leaseState, "leased");
    assert.equal(getResult.leaseStatus, "locked");

    await destBlobClient.syncCopyFromURL(sourceBlobClient.url, {
      conditions: { leaseId }
    });

    const result = await destBlobClient.getProperties();
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "BlockBlob");
    assert.ok(result.lastModified);
    assert.equal(getResult.leaseDuration, "infinite");
    assert.equal(getResult.leaseState, "leased");
    assert.equal(getResult.leaseStatus, "locked");

    await destLeaseClient.releaseLease();
  });

  it("Synchronized copy blob should work for page blob @loki", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getPageBlobClient(sourceBlob);
    const destBlobClient = containerClient.getPageBlobClient(destBlob);

    const metadata = { key: "value" };
    const blobHTTPHeaders = {
      blobCacheControl: "blobCacheControl",
      blobContentDisposition: "blobContentDisposition",
      blobContentEncoding: "blobContentEncoding",
      blobContentLanguage: "blobContentLanguage",
      blobContentType: "blobContentType"
    };

    const result_upload = await sourceBlobClient.create(512, {
      metadata,
      blobHTTPHeaders
    });
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );

    const result_copy = await destBlobClient.syncCopyFromURL(
      sourceBlobClient.url
    );
    assert.equal(
      result_copy._response.request.headers.get("x-ms-client-request-id"),
      result_copy._response.request.requestId
    );
    assert.equal(result_copy.copyStatus, "success");

    const result = await destBlobClient.getProperties();
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "PageBlob");
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata);
    assert.deepStrictEqual(
      result.cacheControl,
      blobHTTPHeaders.blobCacheControl
    );
    assert.deepStrictEqual(result.contentType, blobHTTPHeaders.blobContentType);
    assert.deepStrictEqual(
      result.contentEncoding,
      blobHTTPHeaders.blobContentEncoding
    );
    assert.deepStrictEqual(
      result.contentLanguage,
      blobHTTPHeaders.blobContentLanguage
    );
    assert.deepStrictEqual(
      result.contentDisposition,
      blobHTTPHeaders.blobContentDisposition
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

  it("UploadPage on a Leased page blob, if input LeaseId matches, will success @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("ClearPage on a Leased page blob, if input LeaseId matches, will success @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Resize a Leased page blob, if input LeaseId matches, will success @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("UpdateSequenceNumber a Leased page blob, if input LeaseId matches, will success @loki @sql", async () => {
    // TODO: implement the case later
  });
});
