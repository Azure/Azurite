import {
  StorageSharedKeyCredential,
  BlobServiceClient,
  newPipeline,
  Tags
} from "@azure/storage-blob";
import assert = require("assert");

import { BlobType } from "../../../src/blob/generated/artifacts/models";
import { configLogger } from "../../../src/common/Logger";
import { getMD5FromString } from "../../../src/common/utils/utils";
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

describe("AppendBlobAPIs", () => {
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
  let appendBlobClient = blobClient.getAppendBlobClient();

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
    appendBlobClient = blobClient.getAppendBlobClient();
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  it("Create append blob should work @loki", async () => {
    await appendBlobClient.create();
    const properties = await appendBlobClient.getProperties();
    assert.deepStrictEqual(properties.blobType, "AppendBlob");
    assert.deepStrictEqual(properties.leaseState, "available");
    assert.deepStrictEqual(properties.leaseStatus, "unlocked");
    assert.deepStrictEqual(properties.contentLength, 0);
    assert.deepStrictEqual(properties.contentType, "application/octet-stream");
    assert.deepStrictEqual(properties.contentMD5, undefined);
    assert.deepStrictEqual(properties.contentEncoding, undefined);
    assert.deepStrictEqual(properties.contentDisposition, undefined);
    assert.deepStrictEqual(properties.contentLanguage, undefined);
    assert.deepStrictEqual(properties.cacheControl, undefined);
    assert.deepStrictEqual(properties.blobSequenceNumber, undefined);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 0);
  });

  it("Create append blob with ifTags should work @loki", async () => {
    await appendBlobClient.create();

    const tags: Tags = {
      tag1: 'val1',
      tag2: 'val2'
    }

    await appendBlobClient.setTags(tags);

    try {
      await appendBlobClient.create({
        conditions: {
          tagConditions: `tag1<>'val1'`
        }
      });
      assert.fail();
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }
  });

  it("Create append blob override existing pageblob @loki", async () => {
    const pageBlobClient = blobClient.getPageBlobClient();
    await pageBlobClient.create(512);

    const md5 = new Uint8Array([1, 2, 3, 4, 5]);
    const headers = {
      blobCacheControl: "blobCacheControl_",
      blobContentType: "blobContentType_",
      blobContentMD5: md5,
      blobContentEncoding: "blobContentEncoding_",
      blobContentLanguage: "blobContentLanguage_",
      blobContentDisposition: "blobContentDisposition_"
    };

    const metadata = {
      key1: "value1",
      key2: "val2"
    };

    await appendBlobClient.create({
      blobHTTPHeaders: headers,
      metadata
    });
    const properties = await appendBlobClient.getProperties();
    assert.deepStrictEqual(properties.blobType, "AppendBlob");
    assert.deepStrictEqual(properties.leaseState, "available");
    assert.deepStrictEqual(properties.leaseStatus, "unlocked");
    assert.deepStrictEqual(properties.contentLength, 0);
    assert.deepStrictEqual(properties.contentType, headers.blobContentType);
    assert.deepEqual(properties.contentMD5, md5);
    assert.deepStrictEqual(
      properties.contentEncoding,
      headers.blobContentEncoding
    );
    assert.deepStrictEqual(
      properties.contentDisposition,
      headers.blobContentDisposition
    );
    assert.deepStrictEqual(
      properties.contentLanguage,
      headers.blobContentLanguage
    );
    assert.deepStrictEqual(properties.cacheControl, headers.blobCacheControl);
    assert.deepStrictEqual(properties.metadata, metadata);
    assert.deepStrictEqual(properties.blobSequenceNumber, undefined);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 0);
  });

  it("Create append blob should fail when metadata names are invalid C# identifiers @loki @sql", async () => {
    let invalidNames = [
      "1invalid",
      "invalid.name",
      "invalid-name",
    ]
    for (let i = 0; i < invalidNames.length; i++) {
      const metadata = {
        [invalidNames[i]]: "value"
      };
      let hasError = false;
      try {
        await appendBlobClient.create({
          metadata: metadata
        });
      } catch (error) {
        assert.deepStrictEqual(error.statusCode, 400);
        assert.strictEqual(error.code, 'InvalidMetadata');
        hasError = true;
      }
      if (!hasError) {
        assert.fail();
      }
    }
  });

  it("Delete append blob should work @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.delete();
  });

  it("Create append blob snapshot should work @loki", async () => {
    await appendBlobClient.create();
    const response = await appendBlobClient.createSnapshot();
    const appendBlobSnapshotClient = appendBlobClient.withSnapshot(
      response.snapshot!
    );

    await appendBlobClient.appendBlock("hello", 5);

    let properties = await appendBlobClient.getProperties();
    assert.deepStrictEqual(properties.blobType, "AppendBlob");
    assert.deepStrictEqual(properties.leaseState, "available");
    assert.deepStrictEqual(properties.leaseStatus, "unlocked");
    assert.deepStrictEqual(properties.contentLength, 5);
    assert.deepStrictEqual(properties.contentType, "application/octet-stream");
    assert.deepStrictEqual(properties.contentMD5, undefined);
    assert.deepStrictEqual(properties.contentEncoding, undefined);
    assert.deepStrictEqual(properties.contentDisposition, undefined);
    assert.deepStrictEqual(properties.contentLanguage, undefined);
    assert.deepStrictEqual(properties.cacheControl, undefined);
    assert.deepStrictEqual(properties.blobSequenceNumber, undefined);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 1);

    properties = await appendBlobSnapshotClient.getProperties();
    assert.deepStrictEqual(properties.blobType, "AppendBlob");
    assert.deepStrictEqual(properties.leaseState, "available");
    assert.deepStrictEqual(properties.leaseStatus, "unlocked");
    assert.deepStrictEqual(properties.contentLength, 0);
    assert.deepStrictEqual(properties.contentType, "application/octet-stream");
    assert.deepStrictEqual(properties.contentMD5, undefined);
    assert.deepStrictEqual(properties.contentEncoding, undefined);
    assert.deepStrictEqual(properties.contentDisposition, undefined);
    assert.deepStrictEqual(properties.contentLanguage, undefined);
    assert.deepStrictEqual(properties.cacheControl, undefined);
    assert.deepStrictEqual(properties.blobSequenceNumber, undefined);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 0);
  });

  it("Create append blob snapshot and seal should work and copy seal @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.appendBlock('hello', 5);
    await appendBlobClient.seal();

    const response = await appendBlobClient.createSnapshot();
    const appendBlobSnapshotClient = appendBlobClient.withSnapshot(
      response.snapshot!
    );

    let properties = await appendBlobClient.getProperties();
    assert.deepStrictEqual(properties.blobType, "AppendBlob");
    assert.deepStrictEqual(properties.leaseState, "available");
    assert.deepStrictEqual(properties.leaseStatus, "unlocked");
    assert.deepStrictEqual(properties.contentLength, 5);
    assert.deepStrictEqual(properties.contentType, "application/octet-stream");
    assert.deepStrictEqual(properties.contentMD5, undefined);
    assert.deepStrictEqual(properties.contentEncoding, undefined);
    assert.deepStrictEqual(properties.contentDisposition, undefined);
    assert.deepStrictEqual(properties.contentLanguage, undefined);
    assert.deepStrictEqual(properties.cacheControl, undefined);
    assert.deepStrictEqual(properties.blobSequenceNumber, undefined);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 1);
    assert.deepStrictEqual(properties.isSealed, true);

    properties = await appendBlobSnapshotClient.getProperties();
    assert.deepStrictEqual(properties.blobType, "AppendBlob");
    assert.deepStrictEqual(properties.leaseState, "available");
    assert.deepStrictEqual(properties.leaseStatus, "unlocked");
    assert.deepStrictEqual(properties.contentLength, 5);
    assert.deepStrictEqual(properties.contentType, "application/octet-stream");
    assert.deepStrictEqual(properties.contentMD5, undefined);
    assert.deepStrictEqual(properties.contentEncoding, undefined);
    assert.deepStrictEqual(properties.contentDisposition, undefined);
    assert.deepStrictEqual(properties.contentLanguage, undefined);
    assert.deepStrictEqual(properties.cacheControl, undefined);
    assert.deepStrictEqual(properties.blobSequenceNumber, undefined);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 1);
    assert.deepStrictEqual(properties.isSealed, true);
  });

  it("Copy append blob snapshot should work @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.appendBlock("hello", 5);

    const response = await appendBlobClient.createSnapshot();
    const appendBlobSnapshotClient = appendBlobClient.withSnapshot(
      response.snapshot!
    );

    await appendBlobClient.appendBlock("world", 5);

    const destAppendBlobClient = containerClient.getAppendBlobClient(
      "copiedAppendBlob"
    );
    await destAppendBlobClient.beginCopyFromURL(appendBlobSnapshotClient.url);

    let properties = await appendBlobClient.getProperties();
    assert.deepStrictEqual(properties.contentLength, 10);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 2);

    properties = await appendBlobSnapshotClient.getProperties();
    assert.deepStrictEqual(properties.contentLength, 5);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 1);

    await appendBlobClient.delete({ deleteSnapshots: "include" });

    properties = await destAppendBlobClient.getProperties();
    assert.deepStrictEqual(properties.contentLength, 5);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 1);
    assert.ok(properties.copyId);
    assert.ok(properties.copyCompletedOn);
    assert.deepStrictEqual(properties.copyProgress, "5/5");
    assert.deepStrictEqual(properties.copySource, appendBlobSnapshotClient.url);
    assert.deepStrictEqual(properties.copyStatus, "success");
  });

  it("Synchronized copy append blob snapshot should work @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.appendBlock("hello", 5);

    const response = await appendBlobClient.createSnapshot();
    const appendBlobSnapshotClient = appendBlobClient.withSnapshot(
      response.snapshot!
    );

    await appendBlobClient.appendBlock("world", 5);

    const destAppendBlobClient = containerClient.getAppendBlobClient(
      "copiedAppendBlob"
    );
    await destAppendBlobClient.syncCopyFromURL(appendBlobSnapshotClient.url);

    let properties = await appendBlobClient.getProperties();
    assert.deepStrictEqual(properties.contentLength, 10);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 2);

    properties = await appendBlobSnapshotClient.getProperties();
    assert.deepStrictEqual(properties.contentLength, 5);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 1);

    await appendBlobClient.delete({ deleteSnapshots: "include" });

    properties = await destAppendBlobClient.getProperties();
    assert.deepStrictEqual(properties.contentLength, 5);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 1);
    assert.ok(properties.copyId);
    assert.ok(properties.copyCompletedOn);
    assert.deepStrictEqual(properties.copyProgress, "5/5");
    assert.deepStrictEqual(properties.copySource, appendBlobSnapshotClient.url);
  });

  it("Set append blob metadata should work @loki", async () => {
    await appendBlobClient.create();

    const metadata = {
      key1: "value1",
      key2: "val2"
    };
    await appendBlobClient.setMetadata(metadata);

    const properties = await appendBlobClient.getProperties();
    assert.deepStrictEqual(properties.metadata, metadata);
  });

  it("Set append blob HTTP headers should work @loki", async () => {
    await appendBlobClient.create();

    const md5 = new Uint8Array([1, 2, 3, 4, 5]);
    const headers = {
      blobCacheControl: "blobCacheControl_",
      blobContentType: "blobContentType_",
      blobContentMD5: md5,
      blobContentEncoding: "blobContentEncoding_",
      blobContentLanguage: "blobContentLanguage_",
      blobContentDisposition: "blobContentDisposition_"
    };
    await appendBlobClient.setHTTPHeaders(headers);

    const properties = await appendBlobClient.getProperties();
    assert.deepStrictEqual(properties.cacheControl, headers.blobCacheControl);
    assert.deepStrictEqual(properties.contentType, headers.blobContentType);
    assert.deepEqual(properties.contentMD5, headers.blobContentMD5);
    assert.deepStrictEqual(
      properties.contentEncoding,
      headers.blobContentEncoding
    );
    assert.deepStrictEqual(
      properties.contentLanguage,
      headers.blobContentLanguage
    );
    assert.deepStrictEqual(
      properties.contentDisposition,
      headers.blobContentDisposition
    );
  });

  it("Set tier should not work for append blob @loki", async function () {
    await appendBlobClient.create();
    try {
      await blobClient.setAccessTier("hot");
    } catch (err) {
      return;
    }
    assert.fail();
  });

  it("Append block should work @loki", async () => {
    await appendBlobClient.create();
    let appendBlockResponse = await appendBlobClient.appendBlock("abcdef", 6);
    assert.deepStrictEqual(appendBlockResponse.blobAppendOffset, "0");

    const properties1 = await appendBlobClient.getProperties();
    assert.deepStrictEqual(properties1.blobType, "AppendBlob");
    assert.deepStrictEqual(properties1.leaseState, "available");
    assert.deepStrictEqual(properties1.leaseStatus, "unlocked");
    assert.deepStrictEqual(properties1.contentLength, 6);
    assert.deepStrictEqual(properties1.contentType, "application/octet-stream");
    assert.deepStrictEqual(properties1.contentMD5, undefined);
    assert.deepStrictEqual(properties1.contentEncoding, undefined);
    assert.deepStrictEqual(properties1.contentDisposition, undefined);
    assert.deepStrictEqual(properties1.contentLanguage, undefined);
    assert.deepStrictEqual(properties1.cacheControl, undefined);
    assert.deepStrictEqual(properties1.blobSequenceNumber, undefined);
    assert.deepStrictEqual(properties1.blobCommittedBlockCount, 1);
    assert.deepStrictEqual(properties1.etag, appendBlockResponse.etag);

    await sleep(1000); // Sleep 1 second to make sure last modified time changed
    appendBlockResponse = await appendBlobClient.appendBlock("123456", 6);
    assert.deepStrictEqual(appendBlockResponse.blobAppendOffset, "6");
    assert.notDeepStrictEqual(appendBlockResponse.etag, properties1.etag);
    appendBlockResponse = await appendBlobClient.appendBlock("T", 1);
    assert.deepStrictEqual(appendBlockResponse.blobAppendOffset, "12");
    appendBlockResponse = await appendBlobClient.appendBlock("@", 2);
    assert.deepStrictEqual(appendBlockResponse.blobAppendOffset, "13");

    const properties2 = await appendBlobClient.getProperties();
    assert.deepStrictEqual(properties2.blobType, "AppendBlob");
    assert.deepStrictEqual(properties2.leaseState, "available");
    assert.deepStrictEqual(properties2.leaseStatus, "unlocked");
    assert.deepStrictEqual(properties2.contentLength, 14);
    assert.deepStrictEqual(properties2.contentType, "application/octet-stream");
    assert.deepStrictEqual(properties2.contentMD5, undefined);
    assert.deepStrictEqual(properties2.contentEncoding, undefined);
    assert.deepStrictEqual(properties2.contentDisposition, undefined);
    assert.deepStrictEqual(properties2.contentLanguage, undefined);
    assert.deepStrictEqual(properties2.cacheControl, undefined);
    assert.deepStrictEqual(properties2.blobSequenceNumber, undefined);
    assert.deepStrictEqual(properties2.blobCommittedBlockCount, 4);
    assert.deepStrictEqual(properties1.createdOn, properties2.createdOn);
    assert.notDeepStrictEqual(
      properties1.lastModified,
      properties2.lastModified
    );
    assert.notDeepStrictEqual(properties1.etag, properties2.etag);

    const response = await appendBlobClient.download(0);
    const string = await bodyToString(response, response.contentLength);

    assert.deepStrictEqual(string, "abcdef123456T@");
  });

  it("AppendBlock with ifTags should work @loki", async () => {
    await appendBlobClient.create();

    const tags: Tags = {
      tag1: 'val1',
      tag2: 'val2'
    }

    await appendBlobClient.setTags(tags);

    try {
      await appendBlobClient.appendBlock("123456", 6, {
        conditions: {
          tagConditions: `tag1<>'val1'`
        }
      });
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }
    await appendBlobClient.appendBlock("123456", 6, {
      conditions: {
        tagConditions: `tag1='val1'`
      }
    });

    const response = await appendBlobClient.download(0, undefined, {
      conditions: {
        tagConditions: `tag1='val1'`
      }
    });
    const string = await bodyToString(response, response.contentLength);

    assert.deepStrictEqual(string, "123456");
  });

  it("Download append blob should work @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.appendBlock("abcdef", 6);
    await appendBlobClient.appendBlock("123456", 6);
    await appendBlobClient.appendBlock("T", 1);
    await appendBlobClient.appendBlock("@", 2);

    const response = await appendBlobClient.download(5, 8);
    const string = await bodyToString(response, response.contentLength);
    assert.deepStrictEqual(string, "f123456T");
    assert.deepStrictEqual(response.blobCommittedBlockCount, 4);
    assert.deepStrictEqual(response.blobType, BlobType.AppendBlob);
    assert.deepStrictEqual(response.acceptRanges, "bytes");
    assert.deepStrictEqual(response.contentLength, 8);
    assert.deepStrictEqual(response.contentRange, "bytes 5-12/14");
  });

  it("Download append blob should work for snapshot @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.appendBlock("abcdef", 6);

    const snapshotResponse = await appendBlobClient.createSnapshot();
    const snapshotAppendBlobURL = appendBlobClient.withSnapshot(
      snapshotResponse.snapshot!
    );

    await appendBlobClient.appendBlock("123456", 6);
    await appendBlobClient.appendBlock("T", 1);
    await appendBlobClient.appendBlock("@", 2);

    const response = await snapshotAppendBlobURL.download(3, undefined, { rangeGetContentMD5: true });
    const string = await bodyToString(response);
    assert.deepStrictEqual(string, "def");
    assert.deepEqual(response.contentMD5, await getMD5FromString("def"));
  });

  it("Download append blob should work for copied blob @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.appendBlock("abcdef", 6);

    const copiedAppendBlobClient = containerClient.getAppendBlobClient(
      "copiedAppendBlob"
    );
    await copiedAppendBlobClient.beginCopyFromURL(appendBlobClient.url);

    await appendBlobClient.delete();

    const response = await copiedAppendBlobClient.download(3, undefined, { rangeGetContentMD5: true });
    const string = await bodyToString(response);
    assert.deepStrictEqual(string, "def");
    assert.deepEqual(response.contentMD5, await getMD5FromString("def"));
  });

  it("Append block with invalid blob type should not work @loki", async () => {
    const pageBlobClient = appendBlobClient.getPageBlobClient();
    await pageBlobClient.create(512);

    try {
      await appendBlobClient.appendBlock("a", 1);
    } catch (err) {
      assert.deepStrictEqual(err.code, "InvalidBlobType");
      return;
    }
    assert.fail();
  });

  it("Append block with content length 0 should not work @loki", async () => {
    await appendBlobClient.create();

    try {
      await appendBlobClient.appendBlock("", 0);
    } catch (err) {
      assert.deepStrictEqual(err.code, "InvalidHeaderValue");
      return;
    }
    assert.fail();
  });

  it("Append block append position access condition should work @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.appendBlock("a", 1, {
      conditions: {
        maxSize: 1,
        appendPosition: 0
      }
    });

    try {
      await appendBlobClient.appendBlock("a", 1, {
        conditions: {
          maxSize: 1
        }
      });
    } catch (err) {
      assert.deepStrictEqual(
        err.code,
        "MaxBlobSizeConditionNotMet");
      assert.deepStrictEqual(err.statusCode, 412);

      await appendBlobClient.appendBlock("a", 1, {
        conditions: {
          appendPosition: 1
        }
      });

      try {
        await appendBlobClient.appendBlock("a", 1, {
          conditions: {
            appendPosition: 0
          }
        });
      } catch (err) {
        assert.deepStrictEqual(
          err.code,
          "AppendPositionConditionNotMet");
        assert.deepStrictEqual(err.statusCode, 412);
        return;
      }
      assert.fail();
    }
    assert.fail();
  });

  it("Append block md5 validation should work @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.appendBlock("aEf", 1, {
      transactionalContentMD5: await getMD5FromString("aEf")
    });

    try {
      await appendBlobClient.appendBlock("aEf", 1, {
        transactionalContentMD5: await getMD5FromString("invalid")
      });
    } catch (err) {
      assert.deepStrictEqual(err.code, "Md5Mismatch");
      assert.deepStrictEqual(err.statusCode, 400);
      return;
    }
    assert.fail();
  });

  it("Append block access condition should work @loki", async () => {
    let response = await appendBlobClient.create();
    response = await appendBlobClient.appendBlock("a", 1, {
      conditions: {
        ifMatch: response.etag
      }
    });

    response = await appendBlobClient.appendBlock("a", 1, {
      conditions: {
        ifNoneMatch: "xxxx"
      }
    });

    response = await appendBlobClient.appendBlock("a", 1, {
      conditions: {
        ifModifiedSince: new Date("2000/01/01")
      }
    });

    response = await appendBlobClient.appendBlock("a", 1, {
      conditions: {
        ifUnmodifiedSince: response.lastModified
      }
    });

    try {
      await appendBlobClient.appendBlock("a", 1, {
        conditions: {
          ifMatch: response.etag + "2"
        }
      });
    } catch (err) {
      assert.deepStrictEqual(err.code, "ConditionNotMet");
      assert.deepStrictEqual(err.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("Append block lease condition should work @loki", async () => {
    await appendBlobClient.create();

    const leaseId = "abcdefg";
    const blobLeaseClient = await appendBlobClient.getBlobLeaseClient(leaseId);
    await blobLeaseClient.acquireLease(20);

    const properties = await appendBlobClient.getProperties();
    assert.deepStrictEqual(properties.leaseDuration, "fixed");
    assert.deepStrictEqual(properties.leaseState, "leased");
    assert.deepStrictEqual(properties.leaseStatus, "locked");

    await appendBlobClient.appendBlock("a", 1, {
      conditions: {
        leaseId
      }
    });

    try {
      await appendBlobClient.appendBlock("c", 1);
    } catch (err) {
      assert.deepStrictEqual(err.code, "LeaseIdMissing");
      assert.deepStrictEqual(err.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("Append block should refresh lease state  @loki", async () => {
    await appendBlobClient.create();

    const leaseId = "abcdefg";
    const blobLeaseClient = await appendBlobClient.getBlobLeaseClient(leaseId);
    await blobLeaseClient.acquireLease(20);

    await sleep(20000);

    await appendBlobClient.appendBlock("a", 1);

    try {
      await blobLeaseClient.renewLease();
      assert.fail();
    } catch (err) {
      assert.deepStrictEqual(err.code, "LeaseIdMismatchWithLeaseOperation");
      assert.deepStrictEqual(err.statusCode, 409);
      return;
    }
  });

  it("Seal append blob should work @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.appendBlock("abcdef", 6);
    await appendBlobClient.seal();
  });

  it("Seal already sealed append blob fails @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.seal();

    try {
      await appendBlobClient.seal();
    } catch (err) {
      assert.deepStrictEqual(err.code, "BlobAlreadySealed");
      assert.deepStrictEqual(err.statusCode, 409);
      return;
    }
  });

  it("Seal append blob not found @loki", async () => {
    try {
      await appendBlobClient.seal();
    } catch (err) {
      assert.deepStrictEqual(err.code, "BlobNotFound");
      assert.deepStrictEqual(err.statusCode, 404);
      return;
    }
    assert.fail();
  });

  it("Seal blob wrong type @loki", async () => {
    let blockBlobClient = blobClient.getBlockBlobClient();
    await blockBlobClient.upload('a', 1);

    try {
      await appendBlobClient.seal();
    } catch (err) {
      assert.deepStrictEqual(err.code, "InvalidBlobType");
      assert.deepStrictEqual(err.statusCode, 409);
      return;
    }
    assert.fail();
  });

  it("Seal append blob get blob @loki", async () => {
    await appendBlobClient.create();

    const resultBefore = await blobClient.download(0);
    assert.deepStrictEqual(resultBefore.isSealed, false);

    await appendBlobClient.seal();
    const resultAfter = await blobClient.download(0);
    assert.deepStrictEqual(resultAfter.isSealed, true);
  });

  it("Seal append blob get blob properties @loki", async () => {
    await appendBlobClient.create();

    const resultBefore = await blobClient.getProperties();
    assert.deepStrictEqual(resultBefore.isSealed, false);


    await appendBlobClient.seal();
    const resultAfter = await blobClient.getProperties();
    assert.deepStrictEqual(resultAfter.isSealed, true);
  });

  it("Seal append blob can set blob properties @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.seal();
    await blobClient.setHTTPHeaders({ blobContentType: 'contenttype/subtype' });

    const properties = await blobClient.getProperties();
    assert.deepStrictEqual(properties.contentType, "contenttype/subtype");
  });

  it("Seal append blob can set blob meta data @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.seal();

    await blobClient.setMetadata({ key1: 'val1' });

    const properties = await blobClient.getProperties();
    assert.deepStrictEqual(properties.metadata, { key1: 'val1' });
  });

  it("Seal append blob cannot append @loki", async () => {
    await appendBlobClient.create();
    await appendBlobClient.seal();

    try {
      await appendBlobClient.appendBlock("abcdef", 6);
    } catch (err) {
      assert.deepStrictEqual(err.code, "BlobIsSealed");
      assert.deepStrictEqual(err.statusCode, 409);
      assert.ok((err as any).details.message.startsWith('The specified blob is sealed, and its contents can\'t be modified unless the blob is re-created after a delete.'));
      return;
    }
    assert.fail("sealed blob was able to append");
  });
});
