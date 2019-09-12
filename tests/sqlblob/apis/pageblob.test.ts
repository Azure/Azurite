import {
  Aborter,
  BlobURL,
  ContainerURL,
  PageBlobURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-blob";

import BlobConfiguration from "../../../src/blob/BlobConfiguration";
import Server from "../../../src/blob/BlobServer";
import { configLogger } from "../../../src/common/Logger";
import { StoreDestinationArray } from "../../../src/common/persistence/IExtentStore";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive
} from "../../testutils";

import assert = require("assert");
configLogger(false);

describe("PageBlobAPIs", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11000;
  const metadataDbPath = "__blobTestsStorage__";
  const extentDbPath = "__blobExtentTestsStorage__";
  const persistencePath = "__blobTestsPersistence__";
  const DEFUALT_QUEUE_PERSISTENCE_ARRAY: StoreDestinationArray = [
    {
      persistencyId: "blobTest",
      persistencyPath: persistencePath,
      maxConcurrency: 10
    }
  ];
  const config = new BlobConfiguration(
    host,
    port,
    metadataDbPath,
    extentDbPath,
    DEFUALT_QUEUE_PERSISTENCE_ARRAY,
    false
  );

  // TODO: Create serviceURL factory as tests utils
  const baseURL = `http://${host}:${port}/devstoreaccount1`;
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

  let server: Server;

  before(async () => {
    server = new Server(config);
    await server.start();
  });

  after(async () => {
    await server.close();
    await rmRecursive(metadataDbPath);
    await rmRecursive(extentDbPath);
    await rmRecursive(persistencePath);
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

  it("create with default parameters", async () => {
    await pageBlobURL.create(Aborter.none, 512);

    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, 512),
      "\u0000".repeat(512)
    );
  });

  it("create with all parameters set", async () => {
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
    await pageBlobURL.create(Aborter.none, 512, options);

    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, 512),
      "\u0000".repeat(512)
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
    assert.equal(properties.metadata!.key1, options.metadata.key1);
    assert.equal(properties.metadata!.key2, options.metadata.key2);
  });

  it("download page blob with no ranges uploaded", async () => {
    const length = 512 * 10;
    await pageBlobURL.create(Aborter.none, length);

    const ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);

    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(length)
    );
  });

  it("download page blob with no ranges uploaded after resize to bigger size", async () => {
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

    length *= 2;
    await pageBlobURL.resize(Aborter.none, length);
    ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);

    result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(length)
    );
  });

  it("download page blob with no ranges uploaded after resize to smaller size", async () => {
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
    await pageBlobURL.resize(Aborter.none, length);
    ranges = await pageBlobURL.getPageRanges(Aborter.none, 0, length);
    assert.deepStrictEqual((ranges.pageRange || []).length, 0);
    assert.deepStrictEqual((ranges.clearRange || []).length, 0);

    result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, length),
      "\u0000".repeat(length)
    );
  });

  it("uploadPages", async () => {
    await pageBlobURL.create(Aborter.none, 1024);

    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(await bodyToString(result, 1024), "\u0000".repeat(1024));

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(512), 0, 512);
    await pageBlobURL.uploadPages(Aborter.none, "b".repeat(512), 512, 512);

    const page1 = await pageBlobURL.download(Aborter.none, 0, 512);
    const page2 = await pageBlobURL.download(Aborter.none, 512, 512);

    assert.equal(await bodyToString(page1, 512), "a".repeat(512));
    assert.equal(await bodyToString(page2, 512), "b".repeat(512));
  });

  it("uploadPages with sequential pages", async () => {
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

  it("uploadPages with one big page range", async () => {
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

  it("uploadPages with non-sequential pages", async () => {
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

  it("uploadPages to internally override a sequential range", async () => {
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

  it("uploadPages to internally right align override a sequential range", async () => {
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

  it("uploadPages to internally left align override a sequential range", async () => {
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

  it("uploadPages to totally override a sequential range", async () => {
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

  it("uploadPages to left override a sequential range", async () => {
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

  it("uploadPages to right override a sequential range", async () => {
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

  it("resize override a sequential range", async () => {
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
    await pageBlobURL.resize(Aborter.none, length);

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

  it("uploadPages to internally override a non-sequential range", async () => {
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

  it("uploadPages to internally insert into a non-sequential range", async () => {
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

  it("uploadPages to totally override a non-sequential range", async () => {
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

  it("uploadPages to left override a non-sequential range", async () => {
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

  it("uploadPages to insert into a non-sequential range", async () => {
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

  it("uploadPages to right override a non-sequential range", async () => {
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

  it("clearPages", async () => {
    await pageBlobURL.create(Aborter.none, 1024);
    let result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, 1024),
      "\u0000".repeat(1024)
    );

    await pageBlobURL.uploadPages(Aborter.none, "a".repeat(1024), 0, 1024);
    result = await pageBlobURL.download(Aborter.none, 0, 1024);
    assert.deepStrictEqual(await bodyToString(result, 1024), "a".repeat(1024));

    await pageBlobURL.clearPages(Aborter.none, 0, 512);
    result = await pageBlobURL.download(Aborter.none, 0, 512);
    assert.deepStrictEqual(
      await bodyToString(result, 512),
      "\u0000".repeat(512)
    );
  });

  it("clearPages to internally override a sequential range", async () => {
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

  it("clearPages to totally override a sequential range", async () => {
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

  it("clearPages to left override a sequential range", async () => {
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

  it("clearPages to right override a sequential range", async () => {
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

  it("clearPages to internally override a non-sequential range", async () => {
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

  it("clearPages to internally insert into a non-sequential range", async () => {
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

  it("clearPages to totally override a non-sequential range", async () => {
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

  it("clearPages to left override a non-sequential range", async () => {
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

  it("clearPages to right override a non-sequential range", async () => {
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

  it("getPageRanges", async () => {
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

  it("updateSequenceNumber", async () => {
    await pageBlobURL.create(Aborter.none, 1024);
    let propertiesResponse = await pageBlobURL.getProperties(Aborter.none);

    await pageBlobURL.updateSequenceNumber(Aborter.none, "increment");
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.blobSequenceNumber!, 1);

    await pageBlobURL.updateSequenceNumber(Aborter.none, "update", 10);
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.blobSequenceNumber!, 10);

    await pageBlobURL.updateSequenceNumber(Aborter.none, "max", 100);
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.blobSequenceNumber!, 100);
  });

  // devstoreaccount1 is standard storage account which doesn't support premium page blob tiers
  it.skip("setTier for Page blob", async () => {
    const length = 512 * 5;
    await pageBlobURL.create(Aborter.none, length);
    let propertiesResponse = await pageBlobURL.getProperties(Aborter.none);

    await pageBlobURL.setTier(Aborter.none, "P10");
    propertiesResponse = await pageBlobURL.getProperties(Aborter.none);
    assert.equal(propertiesResponse.accessTier!, "P10");

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
