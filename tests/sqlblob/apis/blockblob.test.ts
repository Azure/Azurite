import {
  Aborter,
  BlobURL,
  BlockBlobURL,
  ContainerURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-blob";

import BlobConfiguration from "../../../src/blob/BlobConfiguration";
import Server from "../../../src/blob/BlobServer";
import { configLogger } from "../../../src/common/Logger";
import { StoreDestinationArray } from "../../../src/common/persistence/IExtentStore";
import {
  base64encode,
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive
} from "../../testutils";

import assert = require("assert");

// Disable debugging log by passing false
configLogger(false);

describe("BlockBlobAPIs", () => {
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
  let blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);

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
    blockBlobURL = BlockBlobURL.fromBlobURL(blobURL);
  });

  afterEach(async () => {
    await containerURL.delete(Aborter.none);
  });

  it("upload with string body and default parameters", async () => {
    const body: string = getUniqueName("randomstring");
    await blockBlobURL.upload(Aborter.none, body, body.length);
    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(await bodyToString(result, body.length), body);
  });

  it("upload with string body and all parameters set", async () => {
    const body: string = getUniqueName("randomstring");
    const options = {
      blobCacheControl: "blobCacheControl",
      blobContentDisposition: "blobContentDisposition",
      blobContentEncoding: "blobContentEncoding",
      blobContentLanguage: "blobContentLanguage",
      blobContentType: "blobContentType",
      metadata: {
        keya: "vala",
        keyb: "valb"
      }
    };
    await blockBlobURL.upload(Aborter.none, body, body.length, {
      blobHTTPHeaders: options,
      metadata: options.metadata
    });
    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(await bodyToString(result, body.length), body);
    assert.deepStrictEqual(result.cacheControl, options.blobCacheControl);
    assert.deepStrictEqual(
      result.contentDisposition,
      options.blobContentDisposition
    );
    assert.deepStrictEqual(result.contentEncoding, options.blobContentEncoding);
    assert.deepStrictEqual(result.contentLanguage, options.blobContentLanguage);
    assert.deepStrictEqual(result.contentType, options.blobContentType);
    assert.deepStrictEqual(result.metadata, options.metadata);
  });

  it("stageBlock", async () => {
    const body = "HelloWorld";
    await blockBlobURL.stageBlock(
      Aborter.none,
      base64encode("1"),
      body,
      body.length
    );
    await blockBlobURL.stageBlock(
      Aborter.none,
      base64encode("2"),
      body,
      body.length
    );
    const listResponse = await blockBlobURL.getBlockList(
      Aborter.none,
      "uncommitted"
    );
    assert.equal(listResponse.uncommittedBlocks!.length, 2);
    assert.equal(listResponse.uncommittedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.uncommittedBlocks![0].size, body.length);
    assert.equal(listResponse.uncommittedBlocks![1].name, base64encode("2"));
    assert.equal(listResponse.uncommittedBlocks![1].size, body.length);
  });

  it("commitBlockList", async () => {
    const body = "HelloWorld";
    await blockBlobURL.stageBlock(
      Aborter.none,
      base64encode("1"),
      body,
      body.length
    );
    await blockBlobURL.stageBlock(
      Aborter.none,
      base64encode("2"),
      body,
      body.length
    );
    await blockBlobURL.commitBlockList(Aborter.none, [
      base64encode("1"),
      base64encode("2")
    ]);
    const listResponse = await blockBlobURL.getBlockList(
      Aborter.none,
      "committed"
    );
    assert.equal(listResponse.committedBlocks!.length, 2);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
    assert.equal(listResponse.committedBlocks![1].name, base64encode("2"));
    assert.equal(listResponse.committedBlocks![1].size, body.length);
  });

  it("commitBlockList with all parameters set", async () => {
    const body = "HelloWorld";
    await blockBlobURL.stageBlock(
      Aborter.none,
      base64encode("1"),
      body,
      body.length
    );
    await blockBlobURL.stageBlock(
      Aborter.none,
      base64encode("2"),
      body,
      body.length
    );

    const options = {
      blobCacheControl: "blobCacheControl",
      blobContentDisposition: "blobContentDisposition",
      blobContentEncoding: "blobContentEncoding",
      blobContentLanguage: "blobContentLanguage",
      blobContentType: "blobContentType",
      metadata: {
        keya: "vala",
        keyb: "valb"
      }
    };
    await blockBlobURL.commitBlockList(
      Aborter.none,
      [base64encode("1"), base64encode("2")],
      {
        blobHTTPHeaders: options,
        metadata: options.metadata
      }
    );

    const listResponse = await blockBlobURL.getBlockList(
      Aborter.none,
      "committed"
    );
    assert.equal(listResponse.committedBlocks!.length, 2);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
    assert.equal(listResponse.committedBlocks![1].name, base64encode("2"));
    assert.equal(listResponse.committedBlocks![1].size, body.length);

    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, body.repeat(2).length),
      body.repeat(2)
    );
    assert.deepStrictEqual(result.cacheControl, options.blobCacheControl);
    assert.deepStrictEqual(
      result.contentDisposition,
      options.blobContentDisposition
    );
    assert.deepStrictEqual(result.contentEncoding, options.blobContentEncoding);
    assert.deepStrictEqual(result.contentLanguage, options.blobContentLanguage);
    assert.deepStrictEqual(result.contentType, options.blobContentType);
    assert.deepStrictEqual(result.metadata, options.metadata);
  });

  it("getBlockList", async () => {
    const body = "HelloWorld";
    await blockBlobURL.stageBlock(
      Aborter.none,
      base64encode("1"),
      body,
      body.length
    );
    await blockBlobURL.stageBlock(
      Aborter.none,
      base64encode("2"),
      body,
      body.length
    );
    await blockBlobURL.commitBlockList(Aborter.none, [base64encode("2")]);
    const listResponse = await blockBlobURL.getBlockList(Aborter.none, "all");
    assert.equal(listResponse.committedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks!.length, 0);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("2"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
  });

  it("upload with Readable stream body and default parameters", async () => {
    const body: string = getUniqueName("randomstring");
    const bodyBuffer = Buffer.from(body);

    await blockBlobURL.upload(Aborter.none, bodyBuffer, body.length);
    const result = await blobURL.download(Aborter.none, 0);

    const downloadedBody = await new Promise((resolve, reject) => {
      const buffer: string[] = [];
      result.readableStreamBody!.on("data", (data: Buffer) => {
        buffer.push(data.toString());
      });
      result.readableStreamBody!.on("end", () => {
        resolve(buffer.join(""));
      });
      result.readableStreamBody!.on("error", reject);
    });

    assert.deepStrictEqual(downloadedBody, body);
  });

  it("upload with Chinese string body and default parameters", async () => {
    const body: string = getUniqueName("randomstring你好");
    await blockBlobURL.upload(Aborter.none, body, Buffer.byteLength(body));
    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, Buffer.byteLength(body)),
      body
    );
  });
});
