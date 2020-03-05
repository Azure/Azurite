import {
  Aborter,
  BlobURL,
  ContainerURL,
  PageBlobURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-blob";
import assert = require("assert");

import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("PageBlobAPIs", () => {
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
  let pageBlobURL = PageBlobURL.fromBlobURL(blobURL);

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
    pageBlobURL = PageBlobURL.fromBlobURL(blobURL);
  });

  afterEach(async () => {
    await containerURL.delete(Aborter.none);
  });

  it("create with default parameters @loki", async () => {
    const reuslt_create = await pageBlobURL.create(Aborter.none, 512);
    assert.equal(
      reuslt_create._response.request.headers.get("x-ms-client-request-id"),
      reuslt_create.clientRequestId
    );

    const result = await blobURL.download(Aborter.none, 0);
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
    const result_create = await pageBlobURL.create(Aborter.none, 512, options);
    assert.equal(
      result_create._response.request.headers.get("x-ms-client-request-id"),
      result_create.clientRequestId
    );

    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, 512),
      "\u0000".repeat(512)
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    const properties = await blobURL.getProperties(Aborter.none);
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

  it("download page blob with partial ranges @loki", async () => {
    const length = 512 * 10;
    await pageBlobURL.create(Aborter.none, length);

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.equal(
      ranges._response.request.headers.get("x-ms-client-request-id"),
      ranges.clientRequestId
    );
    let result = await blobURL.download(Aborter.none, 0, 10);
    assert.deepStrictEqual(result.contentRange, `bytes 0-9/5120`);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(10)
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    result = await blobURL.download(Aborter.none, 1);
    assert.deepStrictEqual(result.contentRange, `bytes 1-5119/5120`);
    assert.deepStrictEqual(result._response.status, 206);
  });

  it("download page blob with no ranges uploaded @loki", async () => {
    const length = 512 * 10;
    await pageBlobURL.create(Aborter.none, length);

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.equal(
      ranges._response.request.headers.get("x-ms-client-request-id"),
      ranges.clientRequestId
    );

    const result = await blobURL.download(Aborter.none, 0);
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
    await pageBlobURL.create(Aborter.none, length);

    let ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.equal(
      ranges._response.request.headers.get("x-ms-client-request-id"),
      ranges.clientRequestId
    );

    let result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(length)
    );
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    length *= 2;
    await pageBlobURL.resize(Aborter.none, length);
    ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.equal(
      ranges._response.request.headers.get("x-ms-client-request-id"),
      ranges.clientRequestId
    );

    result = await blobURL.download(Aborter.none, 0);
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
    await pageBlobURL.create(Aborter.none, length);

    let ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);

    let result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(length)
    );

    length /= 2;
    const result_resize = await pageBlobURL.resize(Aborter.none, length);
    assert.equal(
      result_resize._response.request.headers.get("x-ms-client-request-id"),
      result_resize.clientRequestId
    );
    ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);

    result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(length)
    );
  });

  it("uploadPages @loki", async () => {
    await pageBlobURL.create(Aborter.none, 1024);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, 1024), "\u0000".repeat(1024));

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(512), 0, 512);
    const result_upload = await pageBlobURL.uploadPages(
      Aborter.none,
      "b".repeat(512),
      512,
      512
    );
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
  });

  it("uploadPages with sequential pages @loki", async () => {
    const length = 512 * 3;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(512), 0, 512);
    await pageBlobURL.uploadPages(Aborter.none, "b".repeat(512), 512, 512);
    await pageBlobURL.uploadPages(Aborter.none, "c".repeat(512), 1024, 512);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
    assert.equal(await bodyToString(page3, 512), "c".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { start: 0, end: 511 });
    assert.deepStrictEqual(ranges.pageRange![1], { start: 512, end: 1023 });
    assert.deepStrictEqual(ranges.pageRange![2], { start: 1024, end: 1535 });
  });

  it("uploadPages with one big page range @loki", async () => {
    const length = 512 * 3;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      0,
      length
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
    assert.equal(await bodyToString(page3, 512), "c".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { start: 0, end: 1535 });
  });

  it("uploadPages with non-sequential pages @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(512), 512, 512);
    await pageBlobURL.uploadPages(Aborter.none, "c".repeat(512), 1536, 512);

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "a".repeat(512) +
        "\u0000".repeat(512) +
        "c".repeat(512) +
        "\u0000".repeat(512)
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "c".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { start: 512, end: 1023 });
    assert.deepStrictEqual(ranges.pageRange![1], { start: 1536, end: 2047 });
  });

  it("uploadPages to internally override a sequential range @loki", async () => {
    const length = 512 * 3;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      0,
      length
    );

    await pageBlobURL.uploadPages(Aborter.none, "d".repeat(512), 512, 512);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "c".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) + "d".repeat(512) + "c".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { start: 0, end: 511 });
    assert.deepStrictEqual(ranges.pageRange![1], { start: 512, end: 1023 });
    assert.deepStrictEqual(ranges.pageRange![2], { start: 1024, end: 1535 });
  });

  it("uploadPages to internally right align override a sequential range @loki", async () => {
    const length = 512 * 3;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      0,
      length
    );

    await pageBlobURL.uploadPages(Aborter.none, "d".repeat(512), 1024, 512);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) + "b".repeat(512) + "d".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { start: 0, end: 1023 });
    assert.deepStrictEqual(ranges.pageRange![1], { start: 1024, end: 1535 });
  });

  it("uploadPages to internally left align override a sequential range @loki", async () => {
    const length = 512 * 3;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      0,
      length
    );

    await pageBlobURL.uploadPages(Aborter.none, "d".repeat(512), 0, 512);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);

    assert.equal(await bodyToString(page1, 512), "d".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
    assert.equal(await bodyToString(page3, 512), "c".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "d".repeat(512) + "b".repeat(512) + "c".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { start: 0, end: 511 });
    assert.deepStrictEqual(ranges.pageRange![1], { start: 512, end: 1535 });
  });

  it("uploadPages to totally override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "b".repeat(512));
    assert.equal(await bodyToString(page4, 512), "c".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    let full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "a".repeat(512) +
        "b".repeat(512) +
        "c".repeat(512) +
        "\u0000".repeat(512)
    );

    let ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { start: 512, end: 2047 });

    await pageBlobURL.uploadPages(Aborter.none, "d".repeat(length), 0, length);

    full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(full, length), "d".repeat(length));

    ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { start: 0, end: length - 1 });
  });

  it("uploadPages to left override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "d".repeat(512 * 2),
      0,
      512 * 2
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "d".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "b".repeat(512));
    assert.equal(await bodyToString(page4, 512), "c".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "d".repeat(512) +
        "d".repeat(512) +
        "b".repeat(512) +
        "c".repeat(512) +
        "\u0000".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { start: 0, end: 1023 });
    assert.deepStrictEqual(ranges.pageRange![1], { start: 1024, end: 2047 });
  });

  it("uploadPages to right override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "d".repeat(512 * 2),
      512 * 3,
      512 * 2
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "b".repeat(512));
    assert.equal(await bodyToString(page4, 512), "d".repeat(512));
    assert.equal(await bodyToString(page5, 512), "d".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "a".repeat(512) +
        "b".repeat(512) +
        "d".repeat(512) +
        "d".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 512,
      end: 512 * 3 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      start: 512 * 3,
      end: length - 1
    });
  });

  it("resize override a sequential range @loki", async () => {
    let length = 512 * 3;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      0,
      length
    );

    length = 512 * 2;
    const result_resize = await pageBlobURL.resize(Aborter.none, length);
    assert.equal(
      result_resize._response.request.headers.get("x-ms-client-request-id"),
      result_resize.clientRequestId
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
    assert.equal(await bodyToString(page3, 512), "");

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) + "b".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], { start: 0, end: length - 1 });
  });

  it("uploadPages to internally override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512 * 2),
      0,
      512 * 2
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "b".repeat(512 * 2),
      512 * 3,
      512 * 2
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "d".repeat(512 * 3),
      512,
      512 * 3
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "d".repeat(512));
    assert.equal(await bodyToString(page5, 512), "b".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) +
        "d".repeat(512) +
        "d".repeat(512) +
        "d".repeat(512) +
        "b".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 0,
      end: 512 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      start: 512,
      end: 512 * 4 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![2], {
      start: 512 * 4,
      end: length - 1
    });
  });

  it("uploadPages to internally insert into a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512 * 1),
      0,
      512 * 1
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "b".repeat(512 * 1),
      512 * 4,
      512 * 1
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "d".repeat(512 * 3),
      512,
      512 * 3
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "d".repeat(512));
    assert.equal(await bodyToString(page5, 512), "b".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) +
        "d".repeat(512) +
        "d".repeat(512) +
        "d".repeat(512) +
        "b".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 0,
      end: 512 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      start: 512,
      end: 512 * 4 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![2], {
      start: 512 * 4,
      end: length - 1
    });
  });

  it("uploadPages to totally override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512 * 1),
      512 * 1,
      512 * 1
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "b".repeat(512 * 1),
      512 * 3,
      512 * 1
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "d".repeat(512 * 3),
      512,
      512 * 3
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "d".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "d".repeat(512) +
        "d".repeat(512) +
        "d".repeat(512) +
        "\u0000".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 512,
      end: 512 * 4 - 1
    });
  });

  it("uploadPages to left override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512 * 1),
      512 * 1,
      512 * 1
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "b".repeat(512 * 1),
      512 * 3,
      512 * 1
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "d".repeat(512 * 2),
      512,
      512 * 2
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "d".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "b".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "d".repeat(512) +
        "d".repeat(512) +
        "b".repeat(512) +
        "\u0000".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 512,
      end: 512 * 3 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      start: 512 * 3,
      end: 512 * 4 - 1
    });
  });

  it("uploadPages to insert into a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512 * 1),
      512 * 1,
      512 * 1
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "b".repeat(512 * 1),
      512 * 3,
      512 * 1
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "d".repeat(512 * 1),
      512 * 2,
      512 * 1
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "b".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "a".repeat(512) +
        "d".repeat(512) +
        "b".repeat(512) +
        "\u0000".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 512,
      end: 512 * 2 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      start: 512 * 2,
      end: 512 * 3 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![2], {
      start: 512 * 3,
      end: 512 * 4 - 1
    });
  });

  it("uploadPages to right override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512 * 1),
      512 * 1,
      512 * 1
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "b".repeat(512 * 1),
      512 * 3,
      512 * 1
    );

    await pageBlobURL.uploadPages(
      Aborter.none,
      "d".repeat(512 * 2),
      512 * 2,
      512 * 2
    );

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "d".repeat(512));
    assert.equal(await bodyToString(page4, 512), "d".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "a".repeat(512) +
        "d".repeat(512) +
        "d".repeat(512) +
        "\u0000".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 512,
      end: 512 * 2 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      start: 512 * 2,
      end: 512 * 4 - 1
    });
  });

  it("clearPages @loki", async () => {
    await pageBlobURL.create(Aborter.none, 1024);
    let result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, 1024),
      "\u0000".repeat(1024)
    );

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(1024), 0, 1024);
    result = await pageBlobURL.download(Aborter.none, 0, 1024);
    assert.deepStrictEqual(await bodyToString(result, 1024), "a".repeat(1024));

    const result_clear = await pageBlobURL.clearPages(Aborter.none, 0, 512);
    assert.equal(
      result_clear._response.request.headers.get("x-ms-client-request-id"),
      result_clear.clientRequestId
    );
    result = await pageBlobURL.download(Aborter.none, 0, 512);
    assert.deepStrictEqual(
      await bodyToString(result, 512),
      "\u0000".repeat(512)
    );
  });

  it("clearPages to internally override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobURL.clearPages(Aborter.none, 512 * 2, 512);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "c".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "a".repeat(512) +
        "\u0000".repeat(512) +
        "c".repeat(512) +
        "\u0000".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 512,
      end: 512 * 2 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      start: 512 * 3,
      end: 512 * 4 - 1
    });
  });

  it("clearPages to totally override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobURL.clearPages(Aborter.none, 512, 512 * 3);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
  });

  it("clearPages to left override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobURL.clearPages(Aborter.none, 512 * 2, 512 * 3);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "a".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "a".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 512,
      end: 512 * 2 - 1
    });
  });

  it("clearPages to right override a sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(
      Aborter.none,
      "a".repeat(512) + "b".repeat(512) + "c".repeat(512),
      512,
      512 * 3
    );

    await pageBlobURL.clearPages(Aborter.none, 0, 512 * 3);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "c".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "c".repeat(512) +
        "\u0000".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 512 * 3,
      end: 512 * 4 - 1
    });
  });

  it("clearPages to internally override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(512), 0, 512);
    await pageBlobURL.uploadPages(Aborter.none, "b".repeat(512), 512 * 2, 512);
    await pageBlobURL.uploadPages(Aborter.none, "c".repeat(512), 512 * 4, 512);

    await pageBlobURL.clearPages(Aborter.none, 512, 512 * 3);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "c".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "c".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 0,
      end: 512 * 1 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      start: 512 * 4,
      end: length - 1
    });
  });

  it("clearPages to internally insert into a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(512), 0, 512);
    await pageBlobURL.uploadPages(Aborter.none, "b".repeat(512), 512 * 2, 512);
    await pageBlobURL.uploadPages(Aborter.none, "c".repeat(512), 512 * 4, 512);

    await pageBlobURL.clearPages(Aborter.none, 512, 512 * 1);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "b".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "c".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) +
        "\u0000".repeat(512) +
        "b".repeat(512) +
        "\u0000".repeat(512) +
        "c".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 3);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 0,
      end: 512 * 1 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      start: 512 * 2,
      end: 512 * 3 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![2], {
      start: 512 * 4,
      end: length - 1
    });
  });

  it("clearPages to totally override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(512), 0, 512);
    await pageBlobURL.uploadPages(Aborter.none, "b".repeat(512), 512 * 2, 512);
    await pageBlobURL.uploadPages(Aborter.none, "c".repeat(512), 512 * 4, 512);

    await pageBlobURL.clearPages(Aborter.none, 0, 512 * 5);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
  });

  it("clearPages to left override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(512), 0, 512);
    await pageBlobURL.uploadPages(
      Aborter.none,
      "b".repeat(512 * 2),
      512 * 2,
      512 * 2
    );

    await pageBlobURL.clearPages(Aborter.none, 512 * 3, 512 * 2);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "b".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "\u0000".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "a".repeat(512) +
        "\u0000".repeat(512) +
        "b".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 2);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 0,
      end: 512 * 1 - 1
    });
    assert.deepStrictEqual(ranges.pageRange![1], {
      start: 512 * 2,
      end: 512 * 3 - 1
    });
  });

  it("clearPages to right override a non-sequential range @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, length), "\u0000".repeat(length));

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(512), 512, 512);
    await pageBlobURL.uploadPages(
      Aborter.none,
      "b".repeat(512 * 2),
      512 * 3,
      512 * 2
    );

    await pageBlobURL.clearPages(Aborter.none, 0, 512 * 4);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);
    const page3 = await pageBlobURL.download(Aborter.none, 1024, 512);
    const page4 = await pageBlobURL.download(Aborter.none, 1536, 512);
    const page5 = await pageBlobURL.download(Aborter.none, 2048, 512);

    assert.equal(await bodyToString(page1, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page2, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page3, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page4, 512), "\u0000".repeat(512));
    assert.equal(await bodyToString(page5, 512), "b".repeat(512));

    const full = await pageBlobURL.download(Aborter.none, 0);
    assert.equal(
      await bodyToString(full, length),
      "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "\u0000".repeat(512) +
        "b".repeat(512)
    );

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 1);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);
    assert.deepStrictEqual(ranges.pageRange![0], {
      start: 512 * 4,
      end: length - 1
    });
  });

  it("getPageRanges @loki", async () => {
    await pageBlobURL.create(Aborter.none, 1024);

    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, 1024),
      "\u0000".repeat(1024)
    );

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(512), 0, 512);
    await pageBlobURL.uploadPages(Aborter.none, "b".repeat(512), 512, 512);

    const page1 = await pageBlobURL.getPageRanges(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.getPageRanges(Aborter.none, 512, 512);

    assert.equal(page1.pageRange![0].end, 511);
    assert.equal(page2.pageRange![0].end, 1023);
  });

  it("updateSequenceNumber @loki", async () => {
    await pageBlobURL.create(Aborter.none, 1024);
    let propertiesResponse = await pageBlobURL.getProperties(Aborter.none);

    const result = await pageBlobURL.updateSequenceNumber(
      Aborter.none,
      "increment"
    );
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.blobSequenceNumber!, 1);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    await pageBlobURL.updateSequenceNumber(Aborter.none, "update", 10);
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.blobSequenceNumber!, 10);

    await pageBlobURL.updateSequenceNumber(Aborter.none, "max", 100);
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.blobSequenceNumber!, 100);
  });

  // devstoreaccount1 is standard storage account which doesn't support premium page blob tiers
  it.skip("setTier for Page blob @loki", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);
    let propertiesResponse = await pageBlobURL.getProperties(Aborter.none);

    const result = await pageBlobURL.setTier(Aborter.none, "P10");
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.accessTier!, "P10");
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    await pageBlobURL.setTier(Aborter.none, "P20");
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.accessTier!, "P20");

    await pageBlobURL.setTier(Aborter.none, "P30");
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.accessTier!, "P30");

    await pageBlobURL.setTier(Aborter.none, "P40");
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.accessTier!, "P40");

    await pageBlobURL.setTier(Aborter.none, "P50");
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.accessTier!, "P50");
  });
});
