import { isNode } from "@azure/ms-rest-js";
import {
  StorageSharedKeyCredential,
  newPipeline,
  BlobServiceClient,
  BlobItem,
  Tags
} from "@azure/storage-blob";
import assert = require("assert");

import { BlobCopySourceTags, BlobHTTPHeaders } from "../../../src/blob/generated/artifacts/models";
import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  sleep
} from "../../testutils";
import CustomHeaderPolicyFactory from "../RequestPolicy/CustomHeaderPolicyFactory";
import RangePolicyFactory from "../RequestPolicy/RangePolicyFactory";

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

  it("download with default parameters @loki @sql", async () => {
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

  it("download with ifTags condition @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };

    await blobClient.setTags(tags);
    try {
      (await blobClient.download(undefined, undefined, { conditions: { tagConditions: `tag1='val11'` } }));
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }
  });

  it("getProperties with ifTags condition @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };

    await blobClient.setTags(tags);
    try {
      (await blobClient.getProperties({ conditions: { tagConditions: `tag1='val11'` } }));
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
    }
  });

  it("setProperties with ifTags condition @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };

    await blobClient.setTags(tags);
    try {
      (await blobClient.setHTTPHeaders({ blobContentType: 'contenttype/subtype' },
        { conditions: { tagConditions: `tag1='val11'` } }));
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }
  });

  it("setMetadata with ifTags condition @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };

    await blobClient.setTags(tags);
    try {
      (await blobClient.setMetadata({ key1: 'val1' },
        { conditions: { tagConditions: `tag1='val11'` } }));
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }
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

  it("download should not work when blob in Archive tier @loki @sql", async () => {
    try {

      const result = await blobClient.setAccessTier("Archive");
      assert.equal(
        result._response.request.headers.get("x-ms-client-request-id"),
        result.clientRequestId
      );
      await blobClient.download(0);
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 409);
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

  it("download out of range @loki @sql", async () => {
    try {
      await blobClient.download(content.length + 1, content.length + 10);
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 416);
      return;
    }
    assert.fail();
  });

  it("download invalid range @loki @sql", async () => {
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      }
    );
    pipeline.factories.unshift(
      new RangePolicyFactory("bytes=0--1")
    );
    const serviceClient = new BlobServiceClient(baseURL, pipeline);
    const containerClient = serviceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);

    const result = await blobClient.download(0);
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
    assert.equal(result.contentRange, undefined);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("download partial range (via custom policy) @loki @sql", async () => {
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      }
    );
    pipeline.factories.unshift(
      new RangePolicyFactory("bytes=0-4")
    );
    const serviceClient = new BlobServiceClient(baseURL, pipeline);
    const containerClient = serviceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);

    const result = await blobClient.download(0);
    assert.deepStrictEqual(await bodyToString(result, content.length), content.substring(0, 5));
    assert.equal(result.contentRange, `bytes 0-4/${content.length}`);
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
    assert.equal(
      'true',
      result._response.headers.get("x-ms-delete-type-permanent")
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
        ifNoneMatch: "unmatchedetag"
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

  it("Delete with ifTags should work @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };
    await blobClient.setTags(tags);

    try {
      await blobClient.delete(
        {
          conditions:
          {
            tagConditions: `tag1 <> 'val1'`
          }
        }
      );
    } catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }
  });

  it("should create a snapshot from a blob @loki @sql", async () => {
    const result = await blobClient.createSnapshot();
    assert.ok(result.snapshot);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("Create a snapshot from a blob with ifTags @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };
    await blobClient.setTags(tags);

    try {
      await blobClient.createSnapshot({
        conditions: {
          tagConditions: `tag1 <> 'val1'`
        }
      });
      assert.fail("Should not reach here");
    } catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }
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

  it("should fail when setMetadata with invalid metadata name with hyphen @loki @sql", async () => {
    const metadata = {
      "Content-SHA256": "a"
    };

    // set metadata should fail
    let hasError = false;
    try {
      await blobClient.setMetadata(metadata);
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 400);
      assert.strictEqual(error.code, 'InvalidMetadata');
      hasError = true;
    }
    if (!hasError) {
      assert.fail();
    }

  });

  it("should fail when upload has metadata names that are invalid C# identifiers @loki @sql", async () => {
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
        await blockBlobClient.upload(content, content.length, { metadata });
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

  it("lease blob with ifTags @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };
    await blobClient.setTags(tags);

    const guid = "ca761232ed4211cebacd00aa0057b223";
    const duration = 30;
    blobLeaseClient = await blobClient.getBlobLeaseClient(guid);
    try {
      await blobLeaseClient.acquireLease(duration,
        {
          conditions: {
            tagConditions: `tag1 <> 'val1'`
          }
        }
      );
      assert.fail("Should not reach here");
    } catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }

    await blobLeaseClient.acquireLease(duration);
    try {
      await blobLeaseClient.renewLease(
        {
          conditions: {
            tagConditions: `tag1 <> 'val1'`
          }
        });
      assert.fail("Should not reach here");
    } catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }

    try {
      const newGuid = "3c7e72ebb4304526bc53d8ecef03798f";
      await blobLeaseClient.changeLease(newGuid,
        {
          conditions: {
            tagConditions: `tag1 <> 'val1'`
          }
        });
      assert.fail("Should not reach here");
    } catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }

    try {
      await blobLeaseClient.breakLease(3,
        {
          conditions: {
            tagConditions: `tag1 <> 'val1'`
          }
        });
      assert.fail("Should not reach here");
    } catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }

    try {
      await blobLeaseClient.releaseLease(
        {
          conditions: {
            tagConditions: `tag1 <> 'val1'`
          }
        }
      );
      assert.fail("Should not reach here");
    } catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }

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

  it("Settier with ifTags should work @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };
    await blobClient.setTags(tags);

    try {
      await blobClient.setAccessTier("Cool",
        {
          conditions:
          {
            tagConditions: `tag1 <> 'val1'`
          }
        }
      );
    } catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }
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

  it("setTier set default to cold @loki @sql", async () => {
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

    const result = await blockBlobClient.setAccessTier("Cold");
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    // After setTier, Blob should have accessTierInferred as false in Get
    properties = await blockBlobClient.getProperties();
    assert.equal(properties.accessTier!.toLowerCase(), "cold");
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

  it("Upload blob with accesstier should get accessTierInferred as false @loki", async () => {
    const blobName = getUniqueName("blob");

    const blobClient = containerClient.getBlockBlobClient(blobName);

    await blobClient.upload("hello", 5, { tier: "Hot" });

    const properties = await blobClient.getProperties();
    assert.equal(false, properties.accessTierInferred);

    blobClient.delete();
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

  it("Copy blob with ifTags should work @loki", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getBlockBlobClient(sourceBlob);
    const destBlobClient = containerClient.getBlockBlobClient(destBlob);

    await sourceBlobClient.upload("hello", 5);
    await destBlobClient.upload("start", 5);

    const tags = {
      tag1: "val1",
      tag2: "val2",
    };
    await sourceBlobClient.setTags(tags);
    await destBlobClient.setTags(tags);

    try {
      await destBlobClient.beginCopyFromURL(
        sourceBlobClient.url,
        {
          conditions:
          {
            tagConditions: `tag1 <> 'val1'`
          }
        }
      );
    } catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }
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

  it("Copy blob should work with source archive blob and accesstier header @loki, @sql", async () => {
    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getBlockBlobClient(sourceBlob);
    const destBlobClient = containerClient.getBlockBlobClient(destBlob);

    await sourceBlobClient.upload("hello", 5);
    await sourceBlobClient.setAccessTier("Archive");

    // Copy from Archive blob without accesstier will fail 
    let hasError = false;
    try {
      await destBlobClient.beginCopyFromURL(sourceBlobClient.url);
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 409);
      hasError = true;
    }
    if (!hasError) {
      assert.fail();
    }

    // Copy from Archive blob with accesstier will success
    await destBlobClient.beginCopyFromURL(sourceBlobClient.url, {
      tier: "Hot"
    });

    const result = await destBlobClient.getProperties();
    assert.ok(result.date);
    assert.deepStrictEqual(result.blobType, "BlockBlob");
    assert.ok(result.lastModified);
    assert.deepStrictEqual(result.accessTier, "Hot");
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

  it("Copy blob should fail with 400 when copy source is invalid @loki", async () => {
    const destBlob = getUniqueName("blob");

    const destBlobClient = containerClient.getBlockBlobClient(destBlob);

    try {
      await destBlobClient.beginCopyFromURL('/devstoreaccount1/container78/blob125')
    }
    catch (error) {
      assert.deepStrictEqual(error.statusCode, 400);
      assert.deepStrictEqual(error.code, 'InvalidHeaderValue');
      return;
    }
    assert.fail();
  });

  it("Copy blob should not work with  ifNoneMatch * when dest exist @loki", async () => {
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

    // upload source
    const result_uploadsrc = await sourceBlobClient.upload("hello", 5, {
      metadata,
      blobHTTPHeaders
    });
    assert.equal(
      result_uploadsrc._response.request.headers.get("x-ms-client-request-id"),
      result_uploadsrc.clientRequestId
    );

    // upload destination
    const result_uploaddest = await destBlobClient.upload("hello", 5, {
      metadata,
      blobHTTPHeaders
    });
    assert.equal(
      result_uploaddest._response.request.headers.get("x-ms-client-request-id"),
      result_uploaddest.clientRequestId
    );

    // async copy
    try {
      await destBlobClient.beginCopyFromURL(
        sourceBlobClient.url,
        {
          conditions:
          {
            ifNoneMatch: "*"
          }
        });
    }
    catch (error) {
      assert.deepStrictEqual(error.statusCode, 409);
      return;
    }
    assert.fail();

    // Sync copy
    try {
      await destBlobClient.syncCopyFromURL(
        sourceBlobClient.url,
        {
          conditions:
          {
            ifNoneMatch: "*"
          }
        });
    }
    catch (error) {
      assert.deepStrictEqual(error.statusCode, 409);
      return;
    }
    assert.fail();
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

  it("Synchronized copy blob should work to override tag @loki", async () => {
    const tags = {
      tag1: "val1"
    };
    const tags2 = {
      tag2: "val22"
    };

    const sourceBlob = getUniqueName("blob");
    const destBlob = getUniqueName("blob");

    const sourceBlobClient = containerClient.getBlockBlobClient(sourceBlob);
    const destBlobClient = containerClient.getBlockBlobClient(destBlob);

    await sourceBlobClient.upload("hello", 5, {
      tags: tags
    });

    // with default x-ms-copy-source-tag-option (REPLACE), if copy request has tags, will overwrite with the tags in copy request
    await destBlobClient.syncCopyFromURL(sourceBlobClient.url, {
      tags: tags2
    });
    let result = await destBlobClient.getTags();
    assert.deepStrictEqual(result.tags, tags2);

    // with default x-ms-copy-source-tag-option (REPLACE), if copy request has no tags, dest blob will have no tags
    await destBlobClient.syncCopyFromURL(sourceBlobClient.url);
    result = await destBlobClient.getTags()
    assert.deepStrictEqual(result.tags.tag1, undefined);
    assert.deepStrictEqual(result.tags.tag2, undefined);

    // with x-ms-copy-source-tag-option as COPY, will use source tags
    await destBlobClient.syncCopyFromURL(sourceBlobClient.url, {
      copySourceTags: BlobCopySourceTags.COPY
    });
    result = await destBlobClient.getTags();
    assert.deepStrictEqual(result.tags, tags);

    // with x-ms-copy-source-tag-option as COPY, and copy request has tags, will report error    
    let statusCode
    try {
      await destBlobClient.syncCopyFromURL(sourceBlobClient.url, {
        copySourceTags: BlobCopySourceTags.COPY,
        tags: tags2
      });
    } catch (error) {
      statusCode = error.statusCode;
    }
    assert.deepStrictEqual(statusCode, 400);
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

  it("set/get blob tag should work, with base blob or snapshot @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };
    const tags2 = {
      tag1: "val1",
      tag2: "val22",
      tag3: "val3",
    };

    // Set/get tags on base blob, etag, lastModified should not change
    var properties1 = await blobClient.getProperties();
    await blobClient.setTags(tags);
    let outputTags1 = (await blobClient.getTags()).tags;
    assert.deepStrictEqual(outputTags1, tags);
    var properties2 = await blobClient.getProperties();
    assert.deepStrictEqual(properties1.etag, properties2.etag);
    assert.deepStrictEqual(properties1.lastModified, properties2.lastModified);

    // create snapshot, the tags should be same as base blob
    const snapshotResponse = await blobClient.createSnapshot();
    const blobClientSnapshot = blobClient.withSnapshot(snapshotResponse.snapshot!);
    let outputTags2 = (await blobClientSnapshot.getTags()).tags;
    assert.deepStrictEqual(outputTags2, tags);

    // Set/get  tags on snapshot, base blob tags should not be impacted, etag, lastModified should not change
    var properties1 = await blobClientSnapshot.getProperties();
    await blobClientSnapshot.setTags(tags2);
    outputTags2 = (await blobClientSnapshot.getTags()).tags;
    assert.deepStrictEqual(outputTags2, tags2);
    var properties2 = await blobClientSnapshot.getProperties();
    assert.deepStrictEqual(properties1.etag, properties2.etag);
    assert.deepStrictEqual(properties1.lastModified, properties2.lastModified);

    outputTags1 = (await blobClient.getTags()).tags;
    assert.deepStrictEqual(outputTags1, tags);

    blobClientSnapshot.delete();
  });

  it("set blob tag should work in put block blob, pubBlockList, and startCopyFromURL on block blob, and getBlobProperties, Download Blob, list blob can get blob tags. @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };
    const tags2 = {
      tag1: "val1",
      tag2: "val22",
      tag3: "val3",
    };

    const blockBlobName1 = "block1";
    const blockBlobName2 = "block2";

    let blockBlobClient1 = containerClient.getBlockBlobClient(blockBlobName1);
    let blockBlobClient2 = containerClient.getBlockBlobClient(blockBlobName2);

    // Upload block blob with tags
    await blockBlobClient1.upload(content, content.length,
      {
        tags: tags
      });

    // Get tags, can get detail tags
    let outputTags = (await blockBlobClient1.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags);

    // Get blob properties, can get tag count
    let blobProperties = await blockBlobClient1.getProperties();
    assert.deepStrictEqual(blobProperties._response.parsedHeaders.tagCount, 2);

    // download blob, can get tag count    
    const downloadResult = await blockBlobClient1.download(0);
    assert.deepStrictEqual(downloadResult._response.parsedHeaders.tagCount, 2);

    // startCopyFromURL, can set tag
    await blockBlobClient2.beginCopyFromURL(blockBlobClient1.url, {
      tags: tags2
    });
    outputTags = (await blockBlobClient2.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags2);

    // listBlobsFlat can get tag count
    let listResult = (
      await containerClient
        .listBlobsFlat()
        .byPage()
        .next()
    ).value;
    let blobs = (await listResult).segment.blobItems;
    let blobNotChecked = blobs!.length;
    blobs.forEach((blobItem: BlobItem) => {
      if (blobItem.name === blockBlobName1) {
        assert.deepStrictEqual(blobItem.properties.tagCount, 2);
        blobNotChecked--;
      }
      if (blobItem.name === blockBlobName2) {
        assert.deepStrictEqual(blobItem.properties.tagCount, 3);
        blobNotChecked--;
      }
    });
    assert.deepStrictEqual(blobs!.length - 2, blobNotChecked);

    // listBlobsFlat with include tags can get tag 
    listResult = (
      await containerClient
        .listBlobsFlat({ includeTags: true })
        .byPage()
        .next()
    ).value;
    blobs = (await listResult).segment.blobItems;
    blobNotChecked = blobs!.length;
    blobs.forEach((blobItem: BlobItem) => {
      if (blobItem.name === blockBlobName1) {
        assert.deepStrictEqual(blobItem.properties.tagCount, 2);
        assert.deepStrictEqual(blobItem.tags, tags);
        blobNotChecked--;
      }
      if (blobItem.name === blockBlobName2) {
        assert.deepStrictEqual(blobItem.properties.tagCount, 3);
        assert.deepStrictEqual(blobItem.tags, tags2);
        blobNotChecked--;
      }
    });
    assert.deepStrictEqual(blobs!.length - 2, blobNotChecked);

    // listBlobsByHierarchy can get tag count
    const delimiter = "/";
    listResult = (
      await containerClient
        .listBlobsByHierarchy(delimiter)
        .byPage()
        .next()
    ).value;
    blobs = (await listResult).segment.blobItems;
    blobNotChecked = blobs!.length;
    blobs.forEach((blobItem: BlobItem) => {
      if (blobItem.name === blockBlobName1) {
        assert.deepStrictEqual(blobItem.properties.tagCount, 2);
        blobNotChecked--;
      }
      if (blobItem.name === blockBlobName2) {
        assert.deepStrictEqual(blobItem.properties.tagCount, 3);
        blobNotChecked--;
      }
    });
    assert.deepStrictEqual(blobs!.length - 2, blobNotChecked);

    // listBlobsByHierarchy include tags can get tag 
    listResult = (
      await containerClient
        .listBlobsByHierarchy(delimiter, { includeTags: true })
        .byPage()
        .next()
    ).value;
    blobs = (await listResult).segment.blobItems;
    blobNotChecked = blobs!.length;
    blobs.forEach((blobItem: BlobItem) => {
      if (blobItem.name === blockBlobName1) {
        assert.deepStrictEqual(blobItem.properties.tagCount, 2);
        assert.deepStrictEqual(blobItem.tags, tags);
        blobNotChecked--;
      }
      if (blobItem.name === blockBlobName2) {
        assert.deepStrictEqual(blobItem.properties.tagCount, 3);
        assert.deepStrictEqual(blobItem.tags, tags2);
        blobNotChecked--;
      }
    });
    assert.deepStrictEqual(blobs!.length - 2, blobNotChecked);

    // clean up
    blockBlobClient1.delete();
    blockBlobClient2.delete();
  });

  it("set blob tag should work in create page/append blob, copyFromURL. @loki", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };
    const tags2 = {
      tag1: "val1",
      tag2: "val22",
      tag3: "val3",
    };

    const blockBlobName1 = "block1";
    const blockBlobName2 = "block2";
    const pageBlobName1 = "page1";
    const pageBlobName2 = "page2";
    const appendBlobName1 = "append1";
    const appendBlobName2 = "append2";

    let blockBlobClient1 = containerClient.getBlockBlobClient(blockBlobName1);
    let blockBlobClient2 = containerClient.getBlockBlobClient(blockBlobName2);
    let pageBlobClient1 = containerClient.getBlockBlobClient(pageBlobName1);
    let pageBlobClient2 = containerClient.getBlockBlobClient(pageBlobName2);
    let appendBlobClient1 = containerClient.getBlockBlobClient(appendBlobName1);
    let appendBlobClient2 = containerClient.getBlockBlobClient(appendBlobName2);

    // Upload blob with tags
    await blockBlobClient1.upload(content, content.length,
      {
        tags: tags
      });
    await pageBlobClient1.upload(content, content.length,
      {
        tags: tags
      });
    await appendBlobClient1.upload(content, content.length,
      {
        tags: tags
      });

    // Get tags, can get detail tags
    let outputTags = (await blockBlobClient1.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags);
    outputTags = (await pageBlobClient1.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags);
    outputTags = (await appendBlobClient1.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags);

    // download blob, can get tag count    
    let downloadResult = await blockBlobClient1.download(0);
    assert.deepStrictEqual(downloadResult._response.parsedHeaders.tagCount, 2);
    downloadResult = await pageBlobClient1.download(0);
    assert.deepStrictEqual(downloadResult._response.parsedHeaders.tagCount, 2);
    downloadResult = await appendBlobClient1.download(0);
    assert.deepStrictEqual(downloadResult._response.parsedHeaders.tagCount, 2);

    // startCopyFromURL, can set tag
    await blockBlobClient2.syncCopyFromURL(blockBlobClient1.url, {
      tags: tags2
    });
    await pageBlobClient2.syncCopyFromURL(pageBlobClient1.url, {
      tags: tags2
    });
    await appendBlobClient2.syncCopyFromURL(appendBlobClient1.url, {
      tags: tags2
    });
    outputTags = (await blockBlobClient2.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags2);
    outputTags = (await pageBlobClient2.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags2);
    outputTags = (await appendBlobClient2.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags2);

    // listBlobsFlat with include tags can get tag 
    let listResult = (
      await containerClient
        .listBlobsFlat({ includeTags: true })
        .byPage()
        .next()
    ).value;
    let blobs = (await listResult).segment.blobItems;
    let blobNotChecked = blobs!.length;
    blobs.forEach((blobItem: BlobItem) => {
      if (blobItem.name === blockBlobName1 || blobItem.name === pageBlobName1 || blobItem.name === appendBlobName1) {
        assert.deepStrictEqual(blobItem.properties.tagCount, 2);
        assert.deepStrictEqual(blobItem.tags, tags);
        blobNotChecked--;
      }
      if (blobItem.name === blockBlobName2 || blobItem.name === pageBlobName2 || blobItem.name === appendBlobName2) {
        assert.deepStrictEqual(blobItem.properties.tagCount, 3);
        assert.deepStrictEqual(blobItem.tags, tags2);
        blobNotChecked--;
      }
    });
    assert.deepStrictEqual(blobs!.length - 6, blobNotChecked);

    // clean up
    blockBlobClient1.delete();
    blockBlobClient2.delete();
    pageBlobClient1.delete();
    pageBlobClient2.delete();
    appendBlobClient1.delete();
    appendBlobClient2.delete();
  });

  it("set blob tag fail with invalid tag. @loki @sql", async () => {

    const blockBlobName1 = "block1";
    let blockBlobClient1 = containerClient.getBlockBlobClient(blockBlobName1);
    await blockBlobClient1.upload(content, content.length);

    // tag count should <= 10
    const tooManyTags = {
      tag1: "val1",
      tag2: "val2",
      tag3: "val2",
      tag4: "val2",
      tag5: "val2",
      tag6: "val2",
      tag7: "val2",
      tag8: "val2",
      tag9: "val2",
      tag10: "val2",
      tag11: "val2",
    };
    let statusCode = 0;
    try {
      await await blockBlobClient1.setTags(tooManyTags);;
    } catch (error) {
      statusCode = error.statusCode;
    }
    assert.deepStrictEqual(statusCode, 400);
    let tags1 = {
      tag1: "val1",
      tag2: "val2",
      tag3: "val2",
      tag4: "val2",
      tag5: "val2",
      tag6: "val2",
      tag7: "val2",
      tag8: "val2",
      tag9: "val2",
      tag10: "val2",
    };
    await blockBlobClient1.setTags(tags1);
    let outputTags = (await blockBlobClient1.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags1);

    // key length should >0 and <= 128
    const emptyKeyTags = {
      "": "123123123",
    };
    statusCode = 0;
    try {
      await await blockBlobClient1.setTags(emptyKeyTags);;
    } catch (error) {
      statusCode = error.statusCode;
    }
    assert.deepStrictEqual(statusCode, 400);
    const tooLongKeyTags = {
      "key123401234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890012345678901234567890": "val1",
    };
    statusCode = 0;
    try {
      await await blockBlobClient1.setTags(tooLongKeyTags);;
    } catch (error) {
      statusCode = error.statusCode;
    }
    assert.deepStrictEqual(statusCode, 400);
    let tags2 = {
      "key12301234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890012345678901234567890": "val1",
    };
    await blockBlobClient1.setTags(tags2);
    outputTags = (await blockBlobClient1.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags2);

    // value length should <= 256
    const tooLongvalueTags = {
      tag1: "val12345678900123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789001234567890123456789001234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890012345678901234567890",
    };
    statusCode = 0;
    try {
      await blockBlobClient1.upload(content, content.length,
        {
          tags: tooLongvalueTags
        });
    } catch (error) {
      statusCode = error.statusCode;
    }
    assert.deepStrictEqual(statusCode, 400);
    let tags3 = {
      tag1: "va12345678900123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789001234567890123456789001234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890012345678901234567890",
    };
    await blockBlobClient1.upload(content, content.length,
      {
        tags: tags3
      });
    outputTags = (await blockBlobClient1.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags3);

    // invalid char in key
    let invalidTags = {
      tag1: "abc%abc",
    };
    statusCode = 0;
    try {
      await blockBlobClient1.upload(content, content.length,
        {
          tags: invalidTags
        });
    } catch (error) {
      statusCode = error.statusCode;
    }
    assert.deepStrictEqual(statusCode, 400);

    let invalidTags1 = {
      "abc#ew": "abc",
    };
    statusCode = 0;
    try {
      await blockBlobClient1.upload(content, content.length,
        {
          tags: invalidTags1
        });
    } catch (error) {
      statusCode = error.statusCode;
    }
    assert.deepStrictEqual(statusCode, 400);

    let tags4 = {
      "azAz09 +-./:=_": "azAz09 +-./:=_",
    };
    await blockBlobClient1.upload(content, content.length,
      {
        tags: tags4
      });
    outputTags = (await blockBlobClient1.getTags()).tags;
    assert.deepStrictEqual(outputTags, tags4);

    // clean up
    blockBlobClient1.delete();
  });

  it("Set and get blob tags should work with lease condition @loki @sql", async () => {
    const guid = "ca761232ed4211cebacd00aa0057b223";
    const leaseClient = blockBlobClient.getBlobLeaseClient(guid);
    await leaseClient.acquireLease(-1);

    const tags = {
      tag1: "val1",
      tag2: "val2",
    };
    await blockBlobClient.setTags(tags, { conditions: { leaseId: leaseClient.leaseId } });
    const response = await blockBlobClient.getTags({
      conditions: { leaseId: leaseClient.leaseId },
    });
    assert.deepStrictEqual(response.tags, tags);

    const tags1 = {
      tag1: "val",
    };
    try {
      await blockBlobClient.setTags(tags1);
      assert.fail(
        "Should have failed when setting tags without the right lease condition of a leased blob"
      );
    } catch (err: any) {
      assert.deepStrictEqual(err.code, "LeaseIdMissing", err.msg);
    }

    try {
      const newGuid = "3c7e72ebb4304526bc53d8ecef03798f";
      await blockBlobClient.getTags({ conditions: { leaseId: newGuid } });
      assert.fail(
        "Should have failed when setting tags without the right lease condition of a leased blob"
      );
    } catch (err: any) {
      assert.deepStrictEqual(err.code, "LeaseIdMismatchWithBlobOperation");
    }

    await leaseClient.releaseLease();
  });

  it("get blob tag with ifTags condition @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };
    await blobClient.setTags(tags);

    // Equal conditions
    let outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: `tag1='val1'` } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    try {
      (await blobClient.getTags({ conditions: { tagConditions: `tag1='val11'` } })).tags;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }

    // Greater conditions
    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: `tag1>'val'` } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    try {
      (await blobClient.getTags({ conditions: { tagConditions: `tag1>'val11'` } })).tags;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }

    // Greater or equal conditions
    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: `tag1>'val'` } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: `tag1>='val1'` } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    try {
      (await blobClient.getTags({ conditions: { tagConditions: `tag1>='vam'` } })).tags;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }

    // Less conditions
    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: `tag1 <'val11'` } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: `tag1< 'vam'` } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    try {
      (await blobClient.getTags({ conditions: { tagConditions: `tag1 < 'val1'` } })).tags;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }

    // Less or equal conditions
    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: `tag1 <'val11'` } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: `tag1< 'vam'` } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    try {
      (await blobClient.getTags({ conditions: { tagConditions: `tag1 < 'val1'` } })).tags;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }

    try {
      (await blobClient.getTags({ conditions: { tagConditions: `adfec` } })).tags;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidHeaderValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidHeaderValue');
      assert.ok((err as any).details.message.startsWith('The value for one of the HTTP headers is not in the correct format.'));
    }

    try {
      (await blobClient.getTags({ conditions: { tagConditions: `@container='ab'` } })).tags;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidHeaderValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidHeaderValue');
      assert.ok((err as any).details.message.startsWith('The value for one of the HTTP headers is not in the correct format.'));
    }
  });

  it("get blob tag with ifTags condition - special char comparing @loki @sql", async () => {
    const tags: Tags = {
      key1: '1a',
      key2: 'a1'
    };
    await blobClient.setTags(tags);

    let queryString = `key1>'1 a'`;
    let outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    queryString = `key2>'a 1'`;
    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    queryString = `key1>'1+a'`;
    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    queryString = `key2>'a+1'`;
    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    queryString = `key1>'1.a'`;
    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
    assert.deepStrictEqual(outputTags1, tags);

    queryString = `key2>'a.1'`;
    outputTags1 = (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
    assert.deepStrictEqual(outputTags1, tags);
  });

  it("get blob tag with long ifTags condition @loki @sql", async () => {
    const tags = {
      tag1: "val1",
      tag2: "val2",
    };

    let queryString = `tag1 <> 'v0' `;
    // Storage service may support more than 1000 compare expressions at most
    // Azurite can support only 700 comparing expressions.
    for (let index = 1; index < 700; ++index) {
      queryString += `and tag1 <> 'v${index}'`;
    }

    await blobClient.setTags(tags);
    const result = (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
    assert.deepStrictEqual(tags, result);
  });

  it("get blob tag with invalid ifTags condition string @loki @sql", async () => {
    const tags: Tags = {
      key1: 'value1'
    };
    await blobClient.setTags(tags);

    let queryString = `key111==value1`;
    try {
      (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidHeaderValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidHeaderValue');
      assert.ok((err as any).details.message.startsWith('The value for one of the HTTP headers is not in the correct format.'));
    }

    // ifTags header doesn't support @container
    queryString = `@container='value1'`;
    try {
      (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidHeaderValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidHeaderValue');
      assert.ok((err as any).details.message.startsWith('The value for one of the HTTP headers is not in the correct format.'));
    }

    queryString = `key--1='value1'`;
    try {
      (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidHeaderValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidHeaderValue');
      assert.ok((err as any).details.message.startsWith('The value for one of the HTTP headers is not in the correct format.'));
    }

    queryString = `key1='value$$##'`;
    try {
      (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidHeaderValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidHeaderValue');
      assert.ok((err as any).details.message.startsWith('The value for one of the HTTP headers is not in the correct format.'));
    }

    // key length longer than 128
    queryString = `key12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890<>'value1'`;
    try {
      (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
      assert.fail("Should not reach here.");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }

    // Value length longer than 256
    queryString = `key1<>'value12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890'`;

    const result = (await blobClient.getTags({ conditions: { tagConditions: queryString } })).tags;
    assert.deepStrictEqual(result, tags);
  });

  it("upload invalid x-ms-blob-content-md5 @loki @sql", async () => {
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      }
    );
    pipeline.factories.unshift(
      new CustomHeaderPolicyFactory("x-ms-blob-content-md5", "invalid-md5")
    );
    const serviceClient = new BlobServiceClient(baseURL, pipeline);
    const containerClient = serviceClient.getContainerClient(containerName);

    const blobClient = containerClient.getBlockBlobClient(blobName);
    try {
      await blobClient.upload("hello", 5, { tier: "Hot" });
      assert.fail("Expected MD5 error");
    } catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidOperation');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidOperation');
    }
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

  it("Break Lease on Infinite Lease, if give valid breakPeriod, should be broken after breakperiod @loki @sql", async () => {
    // TODO: implement the case later
  });

  it("Break Lease on Infinite Lease, if not give breakPeriod, should be broken immediately @loki @sql", async () => {
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
