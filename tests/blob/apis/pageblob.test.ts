import {
  newPipeline,
  BlobServiceClient,
  StorageSharedKeyCredential,
  Tags
} from "@azure/storage-blob";
import assert = require("assert");

import { SequenceNumberActionType } from "../../../src/blob/generated/artifacts/models";
import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";
import { getMD5FromString } from "../../../src/common/utils/utils";

// Set true to enable debug log
configLogger(false);

describe("PageBlobAPIs", () => {
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
  let pageBlobClient = blobClient.getPageBlobClient();

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
    pageBlobClient = blobClient.getPageBlobClient();
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  it("create with default parameters @loki", async () => {
    const result_create = await pageBlobClient.create(512);
    assert.equal(
      result_create._response.request.headers.get("x-ms-client-request-id"),
      result_create.clientRequestId
    );

    const result = await blobClient.download(0);
    assert.deepStrictEqual(
      await bodyToString(result, 512),
      "\u0000".repeat(512)
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("create with all parameters set @loki", async () => {
    const options = {
      blobHTTPHeaders: {
        blobCacheControl: "blobCacheControl",
        blobContentDisposition: "blobContentDisposition",
        blobContentEncoding: "blobContentEncoding",
        blobContentLanguage: "blobContentLanguage",
        blobContentType: "blobContentType"
      },
      metadata: {
        key1: "vala",
        key2: "valb"
      }
    };
    const result_create = await pageBlobClient.create(512, options);
    assert.equal(
      result_create._response.request.headers.get("x-ms-client-request-id"),
      result_create.clientRequestId
    );

    const result = await blobClient.download(0);
    assert.deepStrictEqual(
      await bodyToString(result, 512),
      "\u0000".repeat(512)
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const properties = await blobClient.getProperties();
    assert.equal(
      properties.cacheControl,
      options.blobHTTPHeaders.blobCacheControl
    );
    assert.equal(
      properties.contentDisposition,
      options.blobHTTPHeaders.blobContentDisposition
    );
    assert.equal(
      properties.contentEncoding,
      options.blobHTTPHeaders.blobContentEncoding
    );
    assert.equal(
      properties.contentLanguage,
      options.blobHTTPHeaders.blobContentLanguage
    );
    assert.equal(
      properties.contentType,
      options.blobHTTPHeaders.blobContentType
    );
    assert.equal(0, properties.blobSequenceNumber);
    assert.equal(properties.metadata!.key1, options.metadata.key1);
    assert.equal(properties.metadata!.key2, options.metadata.key2);
    assert.equal(
      properties._response.request.headers.get("x-ms-client-request-id"),
      properties.clientRequestId
    );
  });

  it("create should fail when metadata names are invalid C# identifiers @loki @sql", async () => {
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
        await pageBlobClient.create(512, {
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

  it("Create page blob with ifTags should work @loki @sql", async () => {
    await pageBlobClient.create(512);

    const tags: Tags = {
      tag1: 'val1',
      tag2: 'val2'
    }

    await pageBlobClient.setTags(tags);

    try {
      await pageBlobClient.create(512, {
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

  it("download page blob with partial ranges @loki", async () => {
    const length = 512 * 10;
    await pageBlobClient.create(length);

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.equal(
      ranges._response.request.headers.get("x-ms-client-request-id"),
      ranges.clientRequestId
    );
    let result = await blobClient.download(0, 10);
    assert.deepStrictEqual(result.contentRange, `bytes 0-9/5120`);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(10)
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    result = await blobClient.download(1);
    assert.deepStrictEqual(result.contentRange, `bytes 1-5119/5120`);
    assert.deepStrictEqual(result._response.status, 206);
  });

  it("download page blob with no ranges uploaded @loki", async () => {
    const length = 512 * 10;
    await pageBlobClient.create(length);

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.equal(
      ranges._response.request.headers.get("x-ms-client-request-id"),
      ranges.clientRequestId
    );

    const result = await blobClient.download(0);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(length)
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("download page blob with no ranges uploaded after resize to bigger size @loki", async () => {
    let length = 512 * 10;
    await pageBlobClient.create(length);

    let ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.equal(
      ranges._response.request.headers.get("x-ms-client-request-id"),
      ranges.clientRequestId
    );

    let result = await blobClient.download(0);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(length)
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    length *= 2;
    await pageBlobClient.resize(length);
    ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.equal(
      ranges._response.request.headers.get("x-ms-client-request-id"),
      ranges.clientRequestId
    );

    result = await blobClient.download(0);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(length)
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("download page blob with no ranges uploaded after resize to smaller size @loki", async () => {
    let length = 512 * 10;
    await pageBlobClient.create(length);

    let ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);

    let result = await blobClient.download(0);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(length)
    );

    length /= 2;
    const result_resize = await pageBlobClient.resize(length);
    assert.equal(
      result_resize._response.request.headers.get("x-ms-client-request-id"),
      result_resize.clientRequestId
    );
    ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);

    result = await blobClient.download(0);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(length)
    );
  });

  it("download a 0 size page blob with range > 0 will get error @loki", async () => {
    pageBlobClient.deleteIfExists();
    await pageBlobClient.create(0);

    try {
      await pageBlobClient.download(0, 3);
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 416);
      assert.deepStrictEqual(error.response.headers.get("content-range"), 'bytes */0')
      return;
    }
    assert.fail();
  });

  it("Download a blob range should only return ContentMD5 when has request header x-ms-range-get-content-md5  @loki", async () => {
    pageBlobClient.deleteIfExists();

    await pageBlobClient.create(512, { blobHTTPHeaders: { blobContentMD5: await getMD5FromString("a".repeat(512)) } });
    await pageBlobClient.uploadPages("a".repeat(512), 0, 512);

    const properties1 = await pageBlobClient.getProperties();
    assert.deepEqual(properties1.contentMD5, await getMD5FromString("a".repeat(512)));

    let result = await pageBlobClient.download(0, 1024);
    assert.deepStrictEqual(await bodyToString(result, 512), "a".repeat(512));
    assert.deepStrictEqual(result.contentLength, 512);
    assert.deepEqual(result.contentMD5, undefined);
    assert.deepEqual(result.blobContentMD5, await getMD5FromString("a".repeat(512)));

    result = await pageBlobClient.download();
    assert.deepStrictEqual(await bodyToString(result, 512), "a".repeat(512));
    assert.deepStrictEqual(result.contentLength, 512);
    assert.deepEqual(properties1.contentMD5, await getMD5FromString("a".repeat(512)));
    assert.deepEqual(result.blobContentMD5, await getMD5FromString("a".repeat(512)));

    result = await pageBlobClient.download(0, 3, { rangeGetContentMD5: true });
    assert.deepStrictEqual(await bodyToString(result, 3), "aaa");
    assert.deepStrictEqual(result.contentLength, 3);
    assert.deepEqual(result.contentMD5, await getMD5FromString("aaa"));
    assert.deepEqual(result.blobContentMD5, await getMD5FromString("a".repeat(512)));
  });

  it("uploadPages @loki", async () => {
    await pageBlobClient.create(1024);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, 1024), "\u0000".repeat(1024));

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512);
    const result_upload = await pageBlobClient.uploadPages(
      "b".repeat(512),
      512,
      512
    );
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
  });

  it("uploadPages should work with sequence number conditions @loki", async () => {
    await pageBlobClient.create(1024);

    await pageBlobClient.updateSequenceNumber(
      SequenceNumberActionType.Update,
      10
    );

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, 1024), "\u0000".repeat(1024));

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512, {
      conditions: {
        ifSequenceNumberEqualTo: 10,
        ifSequenceNumberLessThan: 11,
        ifSequenceNumberLessThanOrEqualTo: 10
      }
    });
    const result_upload = await pageBlobClient.uploadPages(
      "b".repeat(512),
      512,
      512
    );
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
  });

  it("uploadPages with ifTags should work @loki", async () => {
    await pageBlobClient.create(1024);

    const tags: Tags = {
      tag1: 'val1',
      tag2: 'val2'
    }

    await pageBlobClient.setTags(tags);

    try {
      await pageBlobClient.uploadPages("a".repeat(512), 0, 512, {
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
  });

  it("uploadPages should not work if ifSequenceNumberEqualTo doesn't match @loki", async () => {
    await pageBlobClient.create(1024);

    await pageBlobClient.updateSequenceNumber(
      SequenceNumberActionType.Update,
      10
    );

    try {
      await pageBlobClient.uploadPages("a".repeat(512), 0, 512, {
        conditions: {
          ifSequenceNumberEqualTo: 11
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }

    assert.fail();
  });

  it("uploadPages should not work if ifSequenceNumberLessThan doesn't match @loki", async () => {
    await pageBlobClient.create(1024);

    await pageBlobClient.updateSequenceNumber(
      SequenceNumberActionType.Update,
      10
    );

    try {
      await pageBlobClient.uploadPages("a".repeat(512), 0, 512, {
        conditions: {
          ifSequenceNumberLessThan: 10
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }

    try {
      await pageBlobClient.uploadPages("a".repeat(512), 0, 512, {
        conditions: {
          ifSequenceNumberLessThan: 9
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }

    assert.fail();
  });

  it("uploadPages should not work if ifSequenceNumberLessThanOrEqualTo doesn't match @loki", async () => {
    await pageBlobClient.create(1024);

    await pageBlobClient.updateSequenceNumber(
      SequenceNumberActionType.Update,
      10
    );

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512, {
      conditions: {
        ifSequenceNumberLessThanOrEqualTo: 10
      }
    });

    try {
      await pageBlobClient.uploadPages("a".repeat(512), 0, 512, {
        conditions: {
          ifSequenceNumberLessThanOrEqualTo: 9
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }

    assert.fail();
  });

  it("uploadPages with sequential pages @loki", async () => {
    const length = 512 * 3;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512);
    await pageBlobClient.uploadPages("b".repeat(512), 512, 512);
    await pageBlobClient.uploadPages("c".repeat(512), 1024, 512);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
    assert.equal(await bodyToString(page3, 512), "c".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { offset: 0, count: 511 });
    assert.deepStrictEqual(ranges.pageRange![1], { offset: 512, count: 511 });
    assert.deepStrictEqual(ranges.pageRange![2], { offset: 1024, count: 511 });
  });

  it("uploadPages with one big page range @loki", async () => {
    const length = 512 * 3;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      0,
      length
    );

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
    assert.equal(await bodyToString(page3, 512), "c".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { offset: 0, count: 1535 });
  });

  it("uploadPages with non-sequential pages @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512), 512, 512);
    await pageBlobClient.uploadPages("c".repeat(512), 1536, 512);

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "a".repeat(512) +
      "\u0000".repeat(512) +
      "c".repeat(512) +
      "\u0000".repeat(512)
    );

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "c".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { offset: 512, count: 511 });
    assert.deepStrictEqual(ranges.pageRange![1], { offset: 1536, count: 511 });
  });

  it("uploadPages to internally override a sequential range @loki", async () => {
    const length = 512 * 3;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      0,
      length
    );

    await pageBlobClient.uploadPages("d".repeat(512), 512, 512);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "c".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) + "d".repeat(512) + "c".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { offset: 0, count: 511 });
    assert.deepStrictEqual(ranges.pageRange![1], { offset: 512, count: 511 });
    assert.deepStrictEqual(ranges.pageRange![2], { offset: 1024, count: 511 });
  });

  it("uploadPages to internally right align override a sequential range @loki", async () => {
    const length = 512 * 3;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      0,
      length
    );

    await pageBlobClient.uploadPages("d".repeat(512), 1024, 512);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) + "b".repeat(512) + "d".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { offset: 0, count: 1023 });
    assert.deepStrictEqual(ranges.pageRange![1], { offset: 1024, count: 511 });
  });

  it("uploadPages to internally left align override a sequential range @loki", async () => {
    const length = 512 * 3;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      0,
      length
    );

    await pageBlobClient.uploadPages("d".repeat(512), 0, 512);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);

    assert.equal(await bodyToString(page1, 512), "d".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
    assert.equal(await bodyToString(page3, 512), "c".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "d".repeat(512) + "b".repeat(512) + "c".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { offset: 0, count: 511 });
    assert.deepStrictEqual(ranges.pageRange![1], { offset: 512, count: 1023 });
  });

  it("uploadPages to totally override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "b".repeat(512));
    assert.equal(await bodyToString(page4, 512), "c".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    let full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "a".repeat(512) +
      "b".repeat(512) +
      "c".repeat(512) +
      "\u0000".repeat(512)
    );

    let ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { offset: 512, count: 1535 });

    await pageBlobClient.uploadPages("d".repeat(length), 0, length);

    full = await pageBlobClient.download(0);
    assert.equal(await bodyToString(full, length), "d".repeat(length));

    ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 0,
      count: length - 1
    });
  });

  it("uploadPages to left override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobClient.uploadPages("d".repeat(512 * 2), 0, 512 * 2);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "d".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "b".repeat(512));
    assert.equal(await bodyToString(page4, 512), "c".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "d".repeat(512) +
      "d".repeat(512) +
      "b".repeat(512) +
      "c".repeat(512) +
      "\u0000".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { offset: 0, count: 1023 });
    assert.deepStrictEqual(ranges.pageRange![1], { offset: 1024, count: 1023 });
  });

  it("uploadPages to right override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobClient.uploadPages("d".repeat(512 * 2), 512 * 3, 512 * 2);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "b".repeat(512));
    assert.equal(await bodyToString(page4, 512), "d".repeat(512));
    assert.equal(await bodyToString(page5, 512), "d".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "a".repeat(512) +
      "b".repeat(512) +
      "d".repeat(512) +
      "d".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 512,
      count: 512 * 2 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      offset: 512 * 3,
      count: 512 * 2 - 1
    });
  });

  it("getPageRanges with ifTags should work @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);
    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    const tags: Tags = {
      tag1: 'val1',
      tag2: 'val2'
    }

    await pageBlobClient.setTags(tags);

    try {
      await pageBlobClient.getPageRanges(0, length, {
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
  });

  it("resize override a sequential range @loki", async () => {
    let length = 512 * 3;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      0,
      length
    );

    length = 512 * 2;
    const result_resize = await pageBlobClient.resize(length);
    assert.equal(
      result_resize._response.request.headers.get("x-ms-client-request-id"),
      result_resize.clientRequestId
    );

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
    assert.equal(await bodyToString(page3, 512), "");

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) + "b".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 0,
      count: length - 1
    });
  });

  it("uploadPages to internally override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512 * 2), 0, 512 * 2);

    await pageBlobClient.uploadPages("b".repeat(512 * 2), 512 * 3, 512 * 2);

    await pageBlobClient.uploadPages("d".repeat(512 * 3), 512, 512 * 3);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "d".repeat(512));
    assert.equal(await bodyToString(page5, 512), "b".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) +
      "d".repeat(512) +
      "d".repeat(512) +
      "d".repeat(512) +
      "b".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 0,
      count: 512 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      offset: 512,
      count: 512 * 3 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![2], {
      offset: 512 * 4,
      count: 512 - 1
    });
  });

  it("uploadPages to internally insert into a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512 * 1), 0, 512 * 1);

    await pageBlobClient.uploadPages("b".repeat(512 * 1), 512 * 4, 512 * 1);

    await pageBlobClient.uploadPages("d".repeat(512 * 3), 512, 512 * 3);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "d".repeat(512));
    assert.equal(await bodyToString(page5, 512), "b".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) +
      "d".repeat(512) +
      "d".repeat(512) +
      "d".repeat(512) +
      "b".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 0,
      count: 512 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      offset: 512,
      count: 512 * 3 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![2], {
      offset: 512 * 4,
      count: 512 - 1
    });
  });

  it("uploadPages to totally override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512 * 1), 512 * 1, 512 * 1);

    await pageBlobClient.uploadPages("b".repeat(512 * 1), 512 * 3, 512 * 1);

    await pageBlobClient.uploadPages("d".repeat(512 * 3), 512, 512 * 3);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "d".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "d".repeat(512) +
      "d".repeat(512) +
      "d".repeat(512) +
      "\u0000".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 512,
      count: 512 * 3 - 1
    });
  });

  it("uploadPages to left override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512 * 1), 512 * 1, 512 * 1);

    await pageBlobClient.uploadPages("b".repeat(512 * 1), 512 * 3, 512 * 1);

    await pageBlobClient.uploadPages("d".repeat(512 * 2), 512, 512 * 2);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "b".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "d".repeat(512) +
      "d".repeat(512) +
      "b".repeat(512) +
      "\u0000".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 512,
      count: 512 * 2 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      offset: 512 * 3,
      count: 512 - 1
    });
  });

  it("uploadPages to insert into a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512 * 1), 512 * 1, 512 * 1);

    await pageBlobClient.uploadPages("b".repeat(512 * 1), 512 * 3, 512 * 1);

    await pageBlobClient.uploadPages("d".repeat(512 * 1), 512 * 2, 512 * 1);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "b".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "a".repeat(512) +
      "d".repeat(512) +
      "b".repeat(512) +
      "\u0000".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 512,
      count: 512 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      offset: 512 * 2,
      count: 512 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![2], {
      offset: 512 * 3,
      count: 512 - 1
    });
  });

  it("uploadPages to right override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512 * 1), 512 * 1, 512 * 1);

    await pageBlobClient.uploadPages("b".repeat(512 * 1), 512 * 3, 512 * 1);

    await pageBlobClient.uploadPages("d".repeat(512 * 2), 512 * 2, 512 * 2);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "d".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "a".repeat(512) +
      "d".repeat(512) +
      "d".repeat(512) +
      "\u0000".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 512,
      count: 512 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      offset: 512 * 2,
      count: 512 * 2 - 1
    });
  });

  it("clearPages @loki", async () => {
    await pageBlobClient.create(1024);
    let result = await blobClient.download(0);
    assert.deepStrictEqual(
      await bodyToString(result, 1024),
      "\u0000".repeat(1024)
    );

    await pageBlobClient.uploadPages("a".repeat(1024), 0, 1024);
    result = await pageBlobClient.download(0, 1024);
    assert.deepStrictEqual(await bodyToString(result, 1024), "a".repeat(1024));

    const result_clear = await pageBlobClient.clearPages(0, 512);
    assert.equal(
      result_clear._response.request.headers.get("x-ms-client-request-id"),
      result_clear.clientRequestId
    );
    result = await pageBlobClient.download(0, 512);
    assert.deepStrictEqual(
      await bodyToString(result, 512),
      "\u0000".repeat(512)
    );
  });

  it("clearPages should work with sequence number conditions @loki", async () => {
    await pageBlobClient.create(1024);
    await pageBlobClient.clearPages(0, 512, {
      conditions: {
        ifSequenceNumberEqualTo: 0,
        ifSequenceNumberLessThan: 1,
        ifSequenceNumberLessThanOrEqualTo: 0
      }
    });
  });

  it("clearPages should not work with invalid ifSequenceNumberEqualTo @loki", async () => {
    await pageBlobClient.create(1024);
    try {
      await pageBlobClient.clearPages(0, 512, {
        conditions: {
          ifSequenceNumberEqualTo: 1
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("clearPages should not work with invalid ifSequenceNumberLessThan @loki", async () => {
    await pageBlobClient.create(1024);
    await pageBlobClient.updateSequenceNumber(
      SequenceNumberActionType.Increment
    );

    await pageBlobClient.clearPages(0, 512, {
      conditions: {
        ifSequenceNumberLessThan: 2
      }
    });

    try {
      await pageBlobClient.clearPages(0, 512, {
        conditions: {
          ifSequenceNumberLessThan: 1
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("clearPages should not work with invalid ifSequenceNumberLessThanOrEqualTo @loki", async () => {
    await pageBlobClient.create(1024);
    await pageBlobClient.updateSequenceNumber(
      SequenceNumberActionType.Increment
    );

    await pageBlobClient.clearPages(0, 512, {
      conditions: {
        ifSequenceNumberLessThanOrEqualTo: 1
      }
    });

    try {
      await pageBlobClient.clearPages(0, 512, {
        conditions: {
          ifSequenceNumberLessThanOrEqualTo: 0
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 412);
      return;
    }
    assert.fail();
  });

  it("clearPages to internally override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobClient.clearPages(512 * 2, 512);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "c".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "a".repeat(512) +
      "\u0000".repeat(512) +
      "c".repeat(512) +
      "\u0000".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 512,
      count: 512 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      offset: 512 * 3,
      count: 512 - 1
    });
  });

  it("clearPages to totally override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobClient.clearPages(512, 512 * 3);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
  });

  it("clearPages to left override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobClient.clearPages(512 * 2, 512 * 3);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "a".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 512,
      count: 512 - 1
    });
  });

  it("clearPages to right override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages(
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobClient.clearPages(0, 512 * 3);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "c".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "c".repeat(512) +
      "\u0000".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 512 * 3,
      count: 512 - 1
    });
  });

  it("clearPages to internally override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512);
    await pageBlobClient.uploadPages("b".repeat(512), 512 * 2, 512);
    await pageBlobClient.uploadPages("c".repeat(512), 512 * 4, 512);

    await pageBlobClient.clearPages(512, 512 * 3);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "c".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "c".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 0,
      count: 512 * 1 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      offset: 512 * 4,
      count: 512 - 1
    });
  });

  it("clearPages to internally insert into a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512);
    await pageBlobClient.uploadPages("b".repeat(512), 512 * 2, 512);
    await pageBlobClient.uploadPages("c".repeat(512), 512 * 4, 512);

    await pageBlobClient.clearPages(512, 512 * 1);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "b".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "c".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) +
      "\u0000".repeat(512) +
      "b".repeat(512) +
      "\u0000".repeat(512) +
      "c".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 0,
      count: 512 * 1 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      offset: 512 * 2,
      count: 512 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![2], {
      offset: 512 * 4,
      count: 512 - 1
    });
  });

  it("clearPages will fail when start range longer than blob length @loki", async () => {
    const length = 512 * 2;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512);
    await pageBlobClient.uploadPages("a".repeat(512), 512 * 1, 512);

    await pageBlobClient.getPageRanges(512 * 2 - 1, 512);
    try {
      await pageBlobClient.clearPages(512 * 2, 512);
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 416);
      return;
    }
    assert.fail();
  });

  it("GetPageRanges will fail when start range longer than blob length @loki", async () => {
    const length = 512 * 2;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512);
    await pageBlobClient.uploadPages("a".repeat(512), 512 * 1, 512);

    await pageBlobClient.getPageRanges(512 * 2 - 1, 512);
    try {
      await pageBlobClient.getPageRanges(512 * 2, 512);
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 416);
      return;
    }
    assert.fail();
  });

  it("UploadPages will fail when start range longer than blob length @loki", async () => {
    const length = 512 * 2;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512);
    await pageBlobClient.uploadPages("a".repeat(512), 512 * 1, 512);

    try {
      await pageBlobClient.uploadPages("b".repeat(512), 512 * 2, 512);
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 416);
      return;
    }
    assert.fail();
  });

  it("clearPages to totally override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512);
    await pageBlobClient.uploadPages("b".repeat(512), 512 * 2, 512);
    await pageBlobClient.uploadPages("c".repeat(512), 512 * 4, 512);

    await pageBlobClient.clearPages(0, 512 * 5);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
  });

  it("clearPages to left override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512);
    await pageBlobClient.uploadPages("b".repeat(512 * 2), 512 * 2, 512 * 2);

    await pageBlobClient.clearPages(512 * 3, 512 * 2);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "b".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) +
      "\u0000".repeat(512) +
      "b".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 0,
      count: 512 * 1 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      offset: 512 * 2,
      count: 512 - 1
    });
  });

  it("clearPages to right override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);

    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobClient.uploadPages("a".repeat(512), 512, 512);
    await pageBlobClient.uploadPages("b".repeat(512 * 2), 512 * 3, 512 * 2);

    await pageBlobClient.clearPages(0, 512 * 4);

    const page1 = await pageBlobClient.download(0, 512);
    const page2 = await pageBlobClient.download(512, 512);
    const page3 = await pageBlobClient.download(1024, 512);
    const page4 = await pageBlobClient.download(1536, 512);
    const page5 = await pageBlobClient.download(2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "b".repeat(512));

    const full = await pageBlobClient.download(0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "\u0000".repeat(512) +
      "b".repeat(512)
    );

    const ranges = await pageBlobClient.getPageRanges(0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      offset: 512 * 4,
      count: 512 - 1
    });
  });

  it("getPageRanges @loki", async () => {
    await pageBlobClient.create(1024);

    const result = await blobClient.download(0);
    assert.deepStrictEqual(
      await bodyToString(result, 1024),
      "\u0000".repeat(1024)
    );
    assert.equal(true, result._response.headers.contains("x-ms-creation-time"));

    await pageBlobClient.uploadPages("a".repeat(512), 0, 512);
    await pageBlobClient.uploadPages("b".repeat(512), 512, 512);

    const page1 = await pageBlobClient.getPageRanges(0, 512);
    const page2 = await pageBlobClient.getPageRanges(512, 512);

    assert.equal(page1.pageRange![0].count, 511);
    assert.equal(page2.pageRange![0].count, 511);
  });

  it("updateSequenceNumber @loki", async () => {
    await pageBlobClient.create(1024);
    let propertiesResponse = await pageBlobClient.getProperties();

    const result = await pageBlobClient.updateSequenceNumber("increment");
    propertiesResponse = await pageBlobClient.getProperties();
    assert.equal(propertiesResponse.blobSequenceNumber!, 1);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    await pageBlobClient.updateSequenceNumber("update", 10);
    propertiesResponse = await pageBlobClient.getProperties();
    assert.equal(propertiesResponse.blobSequenceNumber!, 10);

    await pageBlobClient.updateSequenceNumber("max", 100);
    propertiesResponse = await pageBlobClient.getProperties();
    assert.equal(propertiesResponse.blobSequenceNumber!, 100);
  });

  // devstoreaccount1 is standard storage account which doesn't support premium page blob tiers
  it.skip("setAccessTier for Page blob @loki", async () => {
    const length = 512 * 5;
    await pageBlobClient.create(length);
    let propertiesResponse = await pageBlobClient.getProperties();

    const result = await pageBlobClient.setAccessTier("P10");
    propertiesResponse = await pageBlobClient.getProperties();
    assert.equal(propertiesResponse.accessTier!, "P10");
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    await pageBlobClient.setAccessTier("P20");
    propertiesResponse = await pageBlobClient.getProperties();
    assert.equal(propertiesResponse.accessTier!, "P20");

    await pageBlobClient.setAccessTier("P30");
    propertiesResponse = await pageBlobClient.getProperties();
    assert.equal(propertiesResponse.accessTier!, "P30");

    await pageBlobClient.setAccessTier("P40");
    propertiesResponse = await pageBlobClient.getProperties();
    assert.equal(propertiesResponse.accessTier!, "P40");

    await pageBlobClient.setAccessTier("P50");
    propertiesResponse = await pageBlobClient.getProperties();
    assert.equal(propertiesResponse.accessTier!, "P50");
  });
});
