import {
  Aborter,
  AnonymousCredential,
  BlobURL,
  ContainerURL,
  PageBlobURL,
  ServiceURL,
  StorageURL,
} from "@azure/storage-blob";
import assert = require("assert");

import BlobConfiguration from "../../../src/blob/BlobConfiguration";
import Server from "../../../src/blob/BlobServer";
import { bodyToString, getUniqueName, rmRecursive } from "../../testutils";

describe("PageBlobAPIs", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11000;
  const dbPath = "__testsstorage__";
  const persistencePath = "__testspersistence__";
  const config = new BlobConfiguration(
    host,
    port,
    dbPath,
    persistencePath,
    false
  );

  // TODO: Create serviceURL factory as tests utils
  const baseURL = `http://${host}:${port}/devstoreaccount1`;
  const serviceURL = new ServiceURL(
    baseURL,
    StorageURL.newPipeline(new AnonymousCredential(), {
      retryOptions: { maxTries: 1 }
    })
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
    await rmRecursive(dbPath);
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
});
