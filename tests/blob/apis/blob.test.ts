import { isNode } from "@azure/ms-rest-js";
import {
  Aborter,
  BlobURL,
  BlockBlobURL,
  ContainerURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
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
  const serviceURL = new ServiceURL(
    baseURL,
    StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    )
  );

  let containerName: string = getUniqueName("container");
  let containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
  let blobName: string = getUniqueName("blob");
  let blobURL = BlobURL.fromContainerURL(containerURL, blobName);
  let blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
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
    containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);
    blobName = getUniqueName("blob");
    blobURL = BlobURL.fromContainerURL(containerURL, blobName);
    blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
    await blockBlobURL.upload(Aborter.none, content, content.length);
  });

  afterEach(async () => {
    await containerURL.delete(Aborter.none);
  });

  it("download with with default parameters", async () => {
    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
    assert.equal(result.contentRange, undefined);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("download all parameters set", async () => {
    const result = await blobURL.download(Aborter.none, 0, 1, {
      rangeGetContentMD5: true
    });
    assert.deepStrictEqual(await bodyToString(result, 1), content[0]);
    assert.equal(result.contentRange, `bytes 0-0/${content.length}`);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("download entire with range", async () => {
    const result = await blobURL.download(Aborter.none, 0, content.length);
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

  it("delete", async () => {
    const result = await blobURL.delete(Aborter.none);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("should create a snapshot from a blob", async () => {
    const result = await blobURL.createSnapshot(Aborter.none);
    assert.ok(result.snapshot);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("should create a snapshot with metadata from a blob", async () => {
    const metadata = {
      meta1: "val1",
      meta3: "val3"
    };
    const result = await blobURL.createSnapshot(Aborter.none, { metadata });
    assert.ok(result.snapshot);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
    const result2 = await blobURL
      .withSnapshot(result.snapshot!)
      .getProperties(Aborter.none);
    assert.deepStrictEqual(result2.metadata, metadata);
  });

  it("should delete snapshot", async () => {
    const result = await blobURL.createSnapshot(Aborter.none);
    assert.ok(result.snapshot);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
    const blobSnapshotURL = blobURL.withSnapshot(result.snapshot!);
    await blobSnapshotURL.getProperties(Aborter.none);
    await blobSnapshotURL.delete(Aborter.none);
    await blobURL.delete(Aborter.none);
    const result2 = await containerURL.listBlobFlatSegment(
      Aborter.none,
      undefined,
      {
        include: ["snapshots"]
      }
    );
    // Verify that the snapshot is deleted
    assert.equal(result2.segment.blobItems!.length, 0);
    assert.equal(
      result2._response.request.headers.get("x-ms-client-request-id"),
      result2.clientRequestId
    );
  });

  it("should also list snapshots", async () => {
    const result = await blobURL.createSnapshot(Aborter.none);
    assert.ok(result.snapshot);
    const result2 = await containerURL.listBlobFlatSegment(
      Aborter.none,
      undefined,
      {
        include: ["snapshots"]
      }
    );
    assert.strictEqual(result2.segment.blobItems!.length, 2);
  });

  it("should setMetadata with new metadata set", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };
    const result_setmeta = await blobURL.setMetadata(Aborter.none, metadata);
    assert.equal(
      result_setmeta._response.request.headers.get("x-ms-client-request-id"),
      result_setmeta.clientRequestId
    );
    const result = await blobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(result.metadata, metadata);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("acquireLease_available_proposedLeaseId_fixed", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 30;
    const result_acquire = await blobURL.acquireLease(
      Aborter.none,
      guid,
      duration
    );
    assert.equal(
      result_acquire._response.request.headers.get("x-ms-client-request-id"),
      result_acquire.clientRequestId
    );

    const result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const result_release = await blobURL.releaseLease(Aborter.none, guid);
    assert.equal(
      result_release._response.request.headers.get("x-ms-client-request-id"),
      result_release.clientRequestId
    );
  });

  it("acquireLease_available_NoproposedLeaseId_infinite", async () => {
    const leaseResult = await blobURL.acquireLease(Aborter.none, "", -1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await blobURL.releaseLease(Aborter.none, leaseId!);
  });

  it("releaseLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = -1;
    await blobURL.acquireLease(Aborter.none, guid, duration);

    let result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "infinite");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await blobURL.releaseLease(Aborter.none, guid);
    result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, undefined);
    assert.equal(result.leaseState, "available");
    assert.equal(result.leaseStatus, "unlocked");
  });

  it("renewLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    await blobURL.acquireLease(Aborter.none, guid, duration);

    const result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    await sleep(16 * 1000);
    const result2 = await blobURL.getProperties(Aborter.none);
    assert.ok(!result2.leaseDuration);
    assert.equal(result2.leaseState, "expired");
    assert.equal(result2.leaseStatus, "unlocked");

    const result_renew = await blobURL.renewLease(Aborter.none, guid);
    assert.equal(
      result_renew._response.request.headers.get("x-ms-client-request-id"),
      result_renew.clientRequestId
    );
    const result3 = await blobURL.getProperties(Aborter.none);
    assert.equal(result3.leaseDuration, "fixed");
    assert.equal(result3.leaseState, "leased");
    assert.equal(result3.leaseStatus, "locked");

    await blobURL.releaseLease(Aborter.none, guid);
  });

  it("changeLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    await blobURL.acquireLease(Aborter.none, guid, duration);

    const result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const newGuid = "3c7e72ebb4304526bc53d8ecef03798f";
    const result_change = await blobURL.changeLease(
      Aborter.none,
      guid,
      newGuid
    );
    assert.equal(
      result_change._response.request.headers.get("x-ms-client-request-id"),
      result_change.clientRequestId
    );

    await blobURL.getProperties(Aborter.none);
    await blobURL.releaseLease(Aborter.none, newGuid);
  });

  it("breakLease", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 15;
    await blobURL.acquireLease(Aborter.none, guid, duration);

    const result = await blobURL.getProperties(Aborter.none);
    assert.equal(result.leaseDuration, "fixed");
    assert.equal(result.leaseState, "leased");
    assert.equal(result.leaseStatus, "locked");

    const breakDuration = 3;
    let breaklefttime = breakDuration;
    while (breaklefttime > 0) {
      const breakResult = await blobURL.breakLease(Aborter.none, breakDuration);
      assert.equal(
        breakResult._response.request.headers.get("x-ms-client-request-id"),
        breakResult.clientRequestId
      );

      assert.equal(breakResult.leaseTime! <= breaklefttime, true);
      breaklefttime = breakResult.leaseTime!;

      const result2 = await blobURL.getProperties(Aborter.none);
      assert.ok(!result2.leaseDuration);
      assert.equal(result2.leaseState, "breaking");
      assert.equal(result2.leaseStatus, "locked");

      await sleep(500);
    }

    const result3 = await blobURL.getProperties(Aborter.none);
    assert.ok(!result3.leaseDuration);
    assert.equal(result3.leaseState, "broken");
    assert.equal(result3.leaseStatus, "unlocked");

    await blobURL.releaseLease(Aborter.none, guid);
    const result4 = await blobURL.getProperties(Aborter.none);
    assert.equal(result4.leaseDuration, undefined);
    assert.equal(result4.leaseState, "available");
    assert.equal(result4.leaseStatus, "unlocked");
  });

  it("should get the correct headers back when setting metadata", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };
    const setResult = await blobURL.setMetadata(Aborter.none, metadata);
    assert.equal(
      setResult._response.request.headers.get("x-ms-client-request-id"),
      setResult.clientRequestId
    );
    assert.notEqual(setResult.date, undefined);
    assert.notEqual(setResult.eTag, undefined);
    assert.notEqual(setResult.isServerEncrypted, undefined);
    assert.notEqual(setResult.lastModified, undefined);
    assert.notEqual(setResult.requestId, undefined);
    assert.notEqual(setResult.version, undefined);
    const result = await blobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(result.metadata, metadata);
    assert.deepStrictEqual(result.accessTier, "Hot");
    assert.deepStrictEqual(result.acceptRanges, "bytes");
    assert.deepStrictEqual(result.blobType, "BlockBlob");
  });

  // https://docs.microsoft.com/en-us/rest/api/storageservices/get-blob-properties
  // as properties retrieval is implemented, the properties should be added to the tests below
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Header
  it("should get the correct properties set based on set HTTP headers", async () => {
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
    const result_set = await blobURL.setHTTPHeaders(Aborter.none, headers);
    assert.equal(
      result_set._response.request.headers.get("x-ms-client-request-id"),
      result_set.clientRequestId
    );
    const result = await blobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(result.cacheControl, cacheControl);
    assert.deepStrictEqual(result.contentType, contentType);
    assert.deepEqual(result.contentMD5, md5);
    assert.deepStrictEqual(result.contentDisposition, contentDisposition);
    assert.deepStrictEqual(result.contentLanguage, contentLanguage);
  });

  it("setTier set default to cool", async () => {
    const result = await blockBlobURL.setTier(Aborter.none, "Cool");
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const properties = await blockBlobURL.getProperties(Aborter.none);
    assert.equal(properties.accessTier!.toLowerCase(), "cool");
  });

  it("setTier set archive to hot", async () => {
    await blockBlobURL.setTier(Aborter.none, "Archive");
    let properties = await blockBlobURL.getProperties(Aborter.none);
    assert.equal(properties.accessTier!.toLowerCase(), "archive");

    await blockBlobURL.setTier(Aborter.none, "Hot");
    properties = await blockBlobURL.getProperties(Aborter.none);
    if (properties.archiveStatus) {
      assert.equal(
        properties.archiveStatus.toLowerCase(),
        "rehydrate-pending-to-hot"
      );
    }
  });

  it("setHTTPHeaders with default parameters", async () => {
    await blobURL.setHTTPHeaders(Aborter.none, {});
    const result = await blobURL.getProperties(Aborter.none);

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

  it("setHTTPHeaders with all parameters set", async () => {
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
    await blobURL.setHTTPHeaders(Aborter.none, headers);
    const result = await blobURL.getProperties(Aborter.none);
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

  it("Copy blob should work", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobURL = BlockBlobURL.fromContainerURL(
      containerURL,
      sourceBlob
    );
    const destBlobURL = BlockBlobURL.fromContainerURL(containerURL, destBlob);

    const metadata = { key: "value" };
    const blobHTTPHeaders = {
      blobCacheControl: "blobCacheControl",
      blobContentDisposition: "blobContentDisposition",
      blobContentEncoding: "blobContentEncoding",
      blobContentLanguage: "blobContentLanguage",
      blobContentType: "blobContentType"
    };

    const result_upload = await sourceBlobURL.upload(Aborter.none, "hello", 5, {
      metadata,
      blobHTTPHeaders
    });
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );

    const result_startcopy = await destBlobURL.startCopyFromURL(
      Aborter.none,
      sourceBlobURL.url
    );
    assert.equal(
      result_startcopy._response.request.headers.get("x-ms-client-request-id"),
      result_startcopy.clientRequestId
    );

    const result = await destBlobURL.getProperties(Aborter.none);
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

  it("Copy blob should work to override metadata", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobURL = BlockBlobURL.fromContainerURL(
      containerURL,
      sourceBlob
    );
    const destBlobURL = BlockBlobURL.fromContainerURL(containerURL, destBlob);

    const metadata = { key: "value" };
    const metadata2 = { key: "value2" };
    await sourceBlobURL.upload(Aborter.none, "hello", 5, {
      metadata
    });

    await destBlobURL.startCopyFromURL(Aborter.none, sourceBlobURL.url, {
      metadata: metadata2
    });

    const result = await destBlobURL.getProperties(Aborter.none);
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "BlockBlob");
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.metadata, metadata2);
  });

  it("Copy blob should not override destination Lease status", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobURL = BlockBlobURL.fromContainerURL(
      containerURL,
      sourceBlob
    );
    const destBlobURL = BlockBlobURL.fromContainerURL(containerURL, destBlob);

    await sourceBlobURL.upload(Aborter.none, "hello", 5);
    await destBlobURL.upload(Aborter.none, "hello", 5);

    const leaseResult = await destBlobURL.acquireLease(Aborter.none, "", -1);
    const leaseId = leaseResult.leaseId;
    assert.ok(leaseId);

    const getResult = await destBlobURL.getProperties(Aborter.none);
    assert.equal(getResult.leaseDuration, "infinite");
    assert.equal(getResult.leaseState, "leased");
    assert.equal(getResult.leaseStatus, "locked");

    await destBlobURL.startCopyFromURL(Aborter.none, sourceBlobURL.url, {
      blobAccessConditions: { leaseAccessConditions: { leaseId } }
    });

    const result = await destBlobURL.getProperties(Aborter.none);
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "BlockBlob");
    assert.ok(result.lastModified);
    assert.equal(getResult.leaseDuration, "infinite");
    assert.equal(getResult.leaseState, "leased");
    assert.equal(getResult.leaseStatus, "locked");

    await destBlobURL.releaseLease(Aborter.none, leaseId!);
  });

  it("Acquire Lease on Breaking Lease status, if LeaseId not match, throw LeaseIdMismatchWithLease error", async () => {
    // TODO: implement the case later
  });

  it("Renew Lease on Breaking Lease status, if LeaseId not match, throw LeaseIdMismatchWithLease error", async () => {
    // TODO: implement the case later
  });

  it("Change Lease on Breaking Lease status, if LeaseId not match, throw LeaseIdMismatchWithLease error", async () => {
    // TODO: implement the case later
  });

  it("Renew: Lease on Breaking Lease status, if LeaseId not match, throw LeaseIdMismatchWithLease error", async () => {
    // TODO: implement the case later
  });

  it("Acquire Lease on Broken Lease status, if LeaseId not match, throw LeaseIdMismatchWithLease error", async () => {
    // TODO: implement the case later
  });

  it("Break Lease on Infinite Lease, if give valid breakPeriod, should be broken after breadperiod", async () => {
    // TODO: implement the case later
  });

  it("Break Lease on Infinite Lease, if not give breakPeriod, should be broken immidiately", async () => {
    // TODO: implement the case later
  });

  it("Renew: Lease on Leased status, if LeaseId not match, throw LeaseIdMismatchWithLease error", async () => {
    // TODO: implement the case later
  });

  it("Change Lease on Leased status, if input LeaseId not match anyone of leaseID or proposedLeaseId, throw LeaseIdMismatchWithLease error", async () => {
    // TODO: implement the case later
  });

  it("Change Lease on Leased status, if input LeaseId matches proposedLeaseId, will change success", async () => {
    // TODO: implement the case later
  });

  it("UploadPage on a Leased page blob, if input LeaseId matches, will success", async () => {
    // TODO: implement the case later
  });

  it("ClearPage on a Leased page blob, if input LeaseId matches, will success", async () => {
    // TODO: implement the case later
  });

  it("Resize a Leased page blob, if input LeaseId matches, will success", async () => {
    // TODO: implement the case later
  });

  it("UpdateSequenceNumber a Leased page blob, if input LeaseId matches, will success", async () => {
    // TODO: implement the case later
  });
});
