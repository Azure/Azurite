import {
  Aborter,
  AppendBlobURL,
  BlobURL,
  ContainerURL,
  PageBlobURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-blob";
import assert = require("assert");

import { BlobType } from "../../../src/blob/generated/artifacts/models";
import { getMD5FromString } from "../../../src/blob/utils/utils";
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

describe("AppendBlobAPIs", () => {
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
  let appendBlobURL = AppendBlobURL.fromBlobURL(blobURL);

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
    appendBlobURL = AppendBlobURL.fromBlobURL(blobURL);
  });

  afterEach(async () => {
    await containerURL.delete(Aborter.none);
  });

  it("Create append blob should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);
    const properties = await appendBlobURL.getProperties(Aborter.none);
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

  it("Create append blob override existing pageblob @loki", async () => {
    const pageBlobUrl = PageBlobURL.fromBlobURL(blobURL);
    await pageBlobUrl.create(Aborter.none, 512);

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

    await appendBlobURL.create(Aborter.none, {
      blobHTTPHeaders: headers,
      metadata
    });
    const properties = await appendBlobURL.getProperties(Aborter.none);
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

  it("Delete append blob should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);
    await appendBlobURL.delete(Aborter.none);
  });

  it("Create append blob snapshot should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);
    const response = await appendBlobURL.createSnapshot(Aborter.none);
    const appendBlobSnapshotURL = appendBlobURL.withSnapshot(
      response.snapshot!
    );

    await appendBlobURL.appendBlock(Aborter.none, "hello", 5);

    let properties = await appendBlobURL.getProperties(Aborter.none);
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

    properties = await appendBlobSnapshotURL.getProperties(Aborter.none);
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

  it("Synchronized copy append blob snapshot should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);
    await appendBlobURL.appendBlock(Aborter.none, "hello", 5);

    const response = await appendBlobURL.createSnapshot(Aborter.none);
    const appendBlobSnapshotURL = appendBlobURL.withSnapshot(
      response.snapshot!
    );

    await appendBlobURL.appendBlock(Aborter.none, "world", 5);

    const destAppendBlobURL = AppendBlobURL.fromContainerURL(
      containerURL,
      "copiedAppendBlob"
    );
    await destAppendBlobURL.syncCopyFromURL(
      Aborter.none,
      appendBlobSnapshotURL.url
    );

    let properties = await appendBlobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(properties.contentLength, 10);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 2);

    properties = await appendBlobSnapshotURL.getProperties(Aborter.none);
    assert.deepStrictEqual(properties.contentLength, 5);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 1);

    await appendBlobURL.delete(Aborter.none, { deleteSnapshots: "include" });

    properties = await destAppendBlobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(properties.contentLength, 5);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 1);
    assert.ok(properties.copyId);
    assert.ok(properties.copyCompletionTime);
    assert.deepStrictEqual(properties.copyProgress, "5/5");
    assert.deepStrictEqual(properties.copySource, appendBlobSnapshotURL.url);
    assert.deepStrictEqual(properties.copyStatus, "success");
  });

  it("Copy append blob snapshot should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);
    await appendBlobURL.appendBlock(Aborter.none, "hello", 5);

    const response = await appendBlobURL.createSnapshot(Aborter.none);
    const appendBlobSnapshotURL = appendBlobURL.withSnapshot(
      response.snapshot!
    );

    await appendBlobURL.appendBlock(Aborter.none, "world", 5);

    const destAppendBlobURL = AppendBlobURL.fromContainerURL(
      containerURL,
      "copiedAppendBlob"
    );
    await destAppendBlobURL.startCopyFromURL(
      Aborter.none,
      appendBlobSnapshotURL.url
    );

    let properties = await appendBlobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(properties.contentLength, 10);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 2);

    properties = await appendBlobSnapshotURL.getProperties(Aborter.none);
    assert.deepStrictEqual(properties.contentLength, 5);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 1);

    await appendBlobURL.delete(Aborter.none, { deleteSnapshots: "include" });

    properties = await destAppendBlobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(properties.contentLength, 5);
    assert.deepStrictEqual(properties.blobCommittedBlockCount, 1);
    assert.ok(properties.copyId);
    assert.ok(properties.copyCompletionTime);
    assert.deepStrictEqual(properties.copyProgress, "5/5");
    assert.deepStrictEqual(properties.copySource, appendBlobSnapshotURL.url);
    assert.deepStrictEqual(properties.copyStatus, "success");
  });

  it("Set append blob metadata should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);

    const metadata = {
      key1: "value1",
      key2: "val2"
    };
    await appendBlobURL.setMetadata(Aborter.none, metadata);

    const properties = await appendBlobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(properties.metadata, metadata);
  });

  it("Set append blob HTTP headers should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);

    const md5 = new Uint8Array([1, 2, 3, 4, 5]);
    const headers = {
      blobCacheControl: "blobCacheControl_",
      blobContentType: "blobContentType_",
      blobContentMD5: md5,
      blobContentEncoding: "blobContentEncoding_",
      blobContentLanguage: "blobContentLanguage_",
      blobContentDisposition: "blobContentDisposition_"
    };
    await appendBlobURL.setHTTPHeaders(Aborter.none, headers);

    const properties = await appendBlobURL.getProperties(Aborter.none);
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

  it("Set tier should not work for append blob @loki", async function() {
    await appendBlobURL.create(Aborter.none);
    try {
      await blobURL.setTier(Aborter.none, "hot");
    } catch (err) {
      return;
    }
    assert.fail();
  });

  it("Append block should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);
    let appendBlockResponse = await appendBlobURL.appendBlock(
      Aborter.none,
      "abcdef",
      6
    );
    assert.deepStrictEqual(appendBlockResponse.blobAppendOffset, "0");

    const properties1 = await appendBlobURL.getProperties(Aborter.none);
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
    assert.deepStrictEqual(properties1.eTag, appendBlockResponse.eTag);

    await sleep(1000); // Sleep 1 second to make sure last modified time changed
    appendBlockResponse = await appendBlobURL.appendBlock(
      Aborter.none,
      "123456",
      6
    );
    assert.deepStrictEqual(appendBlockResponse.blobAppendOffset, "6");
    assert.notDeepStrictEqual(appendBlockResponse.eTag, properties1.eTag);
    appendBlockResponse = await appendBlobURL.appendBlock(Aborter.none, "T", 1);
    assert.deepStrictEqual(appendBlockResponse.blobAppendOffset, "12");
    appendBlockResponse = await appendBlobURL.appendBlock(Aborter.none, "@", 2);
    assert.deepStrictEqual(appendBlockResponse.blobAppendOffset, "13");

    const properties2 = await appendBlobURL.getProperties(Aborter.none);
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
    assert.deepStrictEqual(properties1.creationTime, properties2.creationTime);
    assert.notDeepStrictEqual(
      properties1.lastModified,
      properties2.lastModified
    );
    assert.notDeepStrictEqual(properties1.eTag, properties2.eTag);

    const response = await appendBlobURL.download(Aborter.none, 0);
    const string = await bodyToString(response);

    assert.deepStrictEqual(string, "abcdef123456T@");
  });

  it("Download append blob should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);
    await appendBlobURL.appendBlock(Aborter.none, "abcdef", 6);
    await appendBlobURL.appendBlock(Aborter.none, "123456", 6);
    await appendBlobURL.appendBlock(Aborter.none, "T", 1);
    await appendBlobURL.appendBlock(Aborter.none, "@", 2);

    const response = await appendBlobURL.download(Aborter.none, 5, 8);
    const string = await bodyToString(response);
    assert.deepStrictEqual(string, "f123456T");
    assert.deepStrictEqual(response.blobCommittedBlockCount, 4);
    assert.deepStrictEqual(response.blobType, BlobType.AppendBlob);
    assert.deepStrictEqual(response.acceptRanges, "bytes");
    assert.deepStrictEqual(response.contentLength, 8);
    assert.deepStrictEqual(response.contentRange, "bytes 5-12/14");
  });

  it("Download append blob should work for snapshot @loki", async () => {
    await appendBlobURL.create(Aborter.none);
    await appendBlobURL.appendBlock(Aborter.none, "abcdef", 6);

    const snapshotResponse = await appendBlobURL.createSnapshot(Aborter.none);
    const snapshotAppendBlobURL = appendBlobURL.withSnapshot(
      snapshotResponse.snapshot!
    );

    await appendBlobURL.appendBlock(Aborter.none, "123456", 6);
    await appendBlobURL.appendBlock(Aborter.none, "T", 1);
    await appendBlobURL.appendBlock(Aborter.none, "@", 2);

    const response = await snapshotAppendBlobURL.download(Aborter.none, 3);
    const string = await bodyToString(response);
    assert.deepStrictEqual(string, "def");
    assert.deepEqual(response.contentMD5, await getMD5FromString("def"));
  });

  it("Download append blob should work for copied blob @loki", async () => {
    await appendBlobURL.create(Aborter.none);
    await appendBlobURL.appendBlock(Aborter.none, "abcdef", 6);

    const copiedAppendBlobURL = AppendBlobURL.fromContainerURL(
      containerURL,
      "copiedAppendBlob"
    );
    await copiedAppendBlobURL.startCopyFromURL(Aborter.none, appendBlobURL.url);

    await appendBlobURL.delete(Aborter.none);

    const response = await copiedAppendBlobURL.download(Aborter.none, 3);
    const string = await bodyToString(response);
    assert.deepStrictEqual(string, "def");
    assert.deepEqual(response.contentMD5, await getMD5FromString("def"));
  });

  it("Append block with invalid blob type should not work @loki", async () => {
    const pageBlobUrl = PageBlobURL.fromBlobURL(appendBlobURL);
    await pageBlobUrl.create(Aborter.none, 512);

    try {
      await appendBlobURL.appendBlock(Aborter.none, "a", 1);
    } catch (err) {
      assert.deepStrictEqual(err.message.includes("InvalidBlobType"), true);
      return;
    }
    assert.fail();
  });

  it("Append block with content length 0 should not work @loki", async () => {
    await appendBlobURL.create(Aborter.none);

    try {
      await appendBlobURL.appendBlock(Aborter.none, "", 0);
    } catch (err) {
      assert.deepStrictEqual(err.message.includes("InvalidHeaderValue"), true);
      return;
    }
    assert.fail();
  });

  it("Append block append position access condition should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);
    await appendBlobURL.appendBlock(Aborter.none, "a", 1, {
      accessConditions: {
        appendPositionAccessConditions: {
          maxSize: 1,
          appendPosition: 0
        }
      }
    });

    try {
      await appendBlobURL.appendBlock(Aborter.none, "a", 1, {
        accessConditions: {
          appendPositionAccessConditions: {
            maxSize: 1
          }
        }
      });
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("MaxBlobSizeConditionNotMet"),
        true
      );
      assert.deepStrictEqual(err.statusCode, 412);

      await appendBlobURL.appendBlock(Aborter.none, "a", 1, {
        accessConditions: {
          appendPositionAccessConditions: {
            appendPosition: 1
          }
        }
      });

      try {
        await appendBlobURL.appendBlock(Aborter.none, "a", 1, {
          accessConditions: {
            appendPositionAccessConditions: {
              appendPosition: 0
            }
          }
        });
      } catch (err) {
        assert.deepStrictEqual(
          err.message.includes("AppendPositionConditionNotMet"),
          true
        );
        assert.deepStrictEqual(err.statusCode, 412);
        return;
      }
      assert.fail();
    }
    assert.fail();
  });

  it("Append block md5 validation should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);
    await appendBlobURL.appendBlock(Aborter.none, "aEf", 1, {
      transactionalContentMD5: await getMD5FromString("aEf")
    });

    try {
      await appendBlobURL.appendBlock(Aborter.none, "aEf", 1, {
        transactionalContentMD5: await getMD5FromString("invalid")
      });
    } catch (err) {
      assert.deepStrictEqual(err.message.includes("Md5Mismatch"), true);
      assert.deepStrictEqual(err.statusCode, 400);
      return;
    }
    assert.fail();
  });

  it("Append block access condition should work @loki", async () => {
    let response = await appendBlobURL.create(Aborter.none);
    response = await appendBlobURL.appendBlock(Aborter.none, "a", 1, {
      accessConditions: {
        modifiedAccessConditions: {
          ifMatch: response.eTag
        }
      }
    });

    response = await appendBlobURL.appendBlock(Aborter.none, "a", 1, {
      accessConditions: {
        modifiedAccessConditions: {
          ifNoneMatch: "xxxx"
        }
      }
    });

    response = await appendBlobURL.appendBlock(Aborter.none, "a", 1, {
      accessConditions: {
        modifiedAccessConditions: {
          ifModifiedSince: new Date("2000/01/01")
        }
      }
    });

    response = await appendBlobURL.appendBlock(Aborter.none, "a", 1, {
      accessConditions: {
        modifiedAccessConditions: {
          ifUnmodifiedSince: response.lastModified
        }
      }
    });

    try {
      await appendBlobURL.appendBlock(Aborter.none, "a", 1, {
        accessConditions: {
          modifiedAccessConditions: {
            ifMatch: response.eTag + "2"
          }
        }
      });
    } catch (err) {
      assert.deepStrictEqual(err.message.includes("ConditionNotMet"), true);
      assert.deepStrictEqual(err.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("Append block lease condition should work @loki", async () => {
    await appendBlobURL.create(Aborter.none);

    const leaseId = "abcdefg";
    await appendBlobURL.acquireLease(Aborter.none, leaseId, 20);

    const properties = await appendBlobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(properties.leaseDuration, "fixed");
    assert.deepStrictEqual(properties.leaseState, "leased");
    assert.deepStrictEqual(properties.leaseStatus, "locked");

    await appendBlobURL.appendBlock(Aborter.none, "a", 1, {
      accessConditions: {
        leaseAccessConditions: {
          leaseId
        }
      }
    });

    try {
      await appendBlobURL.appendBlock(Aborter.none, "c", 1);
    } catch (err) {
      assert.deepStrictEqual(err.message.includes("LeaseIdMissing"), true);
      assert.deepStrictEqual(err.statusCode, 412);
      return;
    }
    assert.fail();
  });
});
