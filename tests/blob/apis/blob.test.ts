import {
  Aborter,
  AnonymousCredential,
  BlobURL,
  BlockBlobURL,
  ContainerURL,
  ServiceURL,
  StorageURL
} from "@azure/storage-blob";
import assert = require("assert");

import BlobConfiguration from "../../../src/blob/BlobConfiguration";
import Server from "../../../src/blob/BlobServer";
import { bodyToString, getUniqueName, rmRecursive } from "../../testutils";

describe("BlobAPIs", () => {
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
  let blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
  const content = "Hello World";

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
    blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
    await blockBlobURL.upload(Aborter.none, content, content.length);
  });

  afterEach(async () => {
    await containerURL.delete(Aborter.none);
  });

  it("download with with default parameters", async () => {
    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(await bodyToString(result, content.length), content);
  });

  it("download all parameters set", async () => {
    const result = await blobURL.download(Aborter.none, 0, 1, {
      rangeGetContentMD5: true
    });
    assert.deepStrictEqual(await bodyToString(result, 1), content[0]);
  });

  it("delete", async () => {
    await blobURL.delete(Aborter.none);
  });

  it("should setMetadata with new metadata set", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };
    await blobURL.setMetadata(Aborter.none, metadata);
    const result = await blobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(result.metadata, metadata);
  });

  // https://docs.microsoft.com/en-us/rest/api/storageservices/get-blob-properties
  // as properties retrieval is implemented, the properties should be added to the tests below
  it("should get the correct properties set based on headers", async () => {
    const metadata = {
      a: "a",
      b: "b"
    };
    await blobURL.setMetadata(Aborter.none, metadata);
    const result = await blobURL.getProperties(Aborter.none);
    assert.deepStrictEqual(result.accessTier, "Hot"); // defaulting for now
    assert.deepStrictEqual(result.acceptRanges, "bytes"); // defaulting for now
    // assert.deepStrictEqual(result.blobCommittedBlockCount, 2); // defaulting 2 for now - currently undefined
    assert.deepStrictEqual(result.blobType, "BlockBlob"); // defaulting for now
    // assert.deepStrictEqual(result.contentType, "text/plain; charset=UTF-8"); // currently undefined
  });
});
