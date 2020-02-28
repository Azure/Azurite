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

import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  base64encode,
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("BlockBlobAPIs", () => {
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
  });

  afterEach(async () => {
    await containerURL.delete(Aborter.none);
  });

  it("upload with string body and default parameters @loki @sql", async () => {
    const body: string = getUniqueName("randomstring");
    const result_upload = await blockBlobURL.upload(
      Aborter.none,
      body,
      body.length
    );
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );
    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(await bodyToString(result, body.length), body);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("upload empty blob @loki @sql", async () => {
    await blockBlobURL.upload(Aborter.none, "", 0);
    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(await bodyToString(result, 0), "");
  });

  it("upload with string body and all parameters set @loki @sql", async () => {
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
    const result_upload = await blockBlobURL.upload(
      Aborter.none,
      body,
      body.length,
      {
        blobHTTPHeaders: options,
        metadata: options.metadata
      }
    );
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );
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
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("stageBlock @loki @sql", async () => {
    const body = "HelloWorld";
    const result_stage = await blockBlobURL.stageBlock(
      Aborter.none,
      base64encode("1"),
      body,
      body.length
    );
    assert.equal(
      result_stage._response.request.headers.get("x-ms-client-request-id"),
      result_stage.clientRequestId
    );
    await blockBlobURL.stageBlock(
      Aborter.none,
      base64encode("2"),
      body,
      body.length
    );

    const listBlobResponse = await containerURL.listBlobFlatSegment(
      Aborter.none,
      undefined,
      { include: ["uncommittedblobs"] }
    );
    assert.equal(listBlobResponse.segment.blobItems.length, 1);
    assert.deepStrictEqual(
      listBlobResponse.segment.blobItems[0].properties.contentLength,
      0
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
    assert.equal(
      listResponse._response.request.headers.get("x-ms-client-request-id"),
      listResponse.clientRequestId
    );
  });

  it("commitBlockList @loki @sql", async () => {
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
    const result_commit = await blockBlobURL.commitBlockList(Aborter.none, [
      base64encode("1"),
      base64encode("2")
    ]);
    assert.equal(
      result_commit._response.request.headers.get("x-ms-client-request-id"),
      result_commit.clientRequestId
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
    assert.equal(
      listResponse._response.request.headers.get("x-ms-client-request-id"),
      listResponse.clientRequestId
    );
  });

  it("commitBlockList with previous committed blocks @loki @sql", async () => {
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
    const result_commit = await blockBlobURL.commitBlockList(Aborter.none, [
      base64encode("1"),
      base64encode("2")
    ]);
    assert.equal(
      result_commit._response.request.headers.get("x-ms-client-request-id"),
      result_commit.clientRequestId
    );

    const properties1 = await blockBlobURL.getProperties(Aborter.none);
    assert.notDeepStrictEqual(properties1.creationTime, undefined);

    const listResponse = await blockBlobURL.getBlockList(
      Aborter.none,
      "committed"
    );
    assert.equal(listResponse.committedBlocks!.length, 2);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
    assert.equal(listResponse.committedBlocks![1].name, base64encode("2"));
    assert.equal(listResponse.committedBlocks![1].size, body.length);
    assert.equal(
      listResponse._response.request.headers.get("x-ms-client-request-id"),
      listResponse.clientRequestId
    );

    await blockBlobURL.commitBlockList(Aborter.none, [base64encode("2")]);
    const listResponse2 = await blockBlobURL.getBlockList(
      Aborter.none,
      "committed"
    );
    assert.equal(listResponse2.committedBlocks!.length, 1);
    assert.equal(listResponse2.committedBlocks![0].name, base64encode("2"));
    assert.equal(listResponse2.committedBlocks![0].size, body.length);

    const properties2 = await blockBlobURL.getProperties(Aborter.none);
    assert.notDeepStrictEqual(properties2.creationTime, undefined);
    assert.deepStrictEqual(properties1.creationTime, properties2.creationTime);
  });

  it("commitBlockList with empty list should create an empty block blob @loki @sql", async () => {
    await blockBlobURL.commitBlockList(Aborter.none, []);

    const listResponse = await blockBlobURL.getBlockList(
      Aborter.none,
      "committed"
    );
    assert.equal(listResponse.committedBlocks!.length, 0);

    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(await bodyToString(result, 0), "");
  });

  it("commitBlockList with all parameters set @loki @sql", async () => {
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
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("getBlockList @loki @sql", async () => {
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

  it("getBlockList_BlockListingFilter @loki @sql", async () => {
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

    // Getproperties on a block blob without commited block will return 404
    let err;
    try {
      await blockBlobURL.getProperties(Aborter.none);
    } catch (error) {
      err = error;
    }
    assert.deepStrictEqual(err.statusCode, 404);

    // Stage block with block Id length different than the exist uncommited blocks will fail with 400
    try {
      await blockBlobURL.stageBlock(
        Aborter.none,
        base64encode("123"),
        body,
        body.length
      );
    } catch (error) {
      err = error;
    }
    assert.deepStrictEqual(err.statusCode, 400);

    await blockBlobURL.commitBlockList(Aborter.none, [
      base64encode("1"),
      base64encode("2")
    ]);

    await blockBlobURL.stageBlock(
      Aborter.none,
      base64encode("123"),
      body,
      body.length
    );

    let listResponse = await blockBlobURL.getBlockList(
      Aborter.none,
      "committed"
    );
    assert.equal(listResponse.committedBlocks!.length, 2);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
    assert.equal(listResponse.committedBlocks![1].name, base64encode("2"));
    assert.equal(listResponse.committedBlocks![1].size, body.length);
    assert.equal(listResponse.uncommittedBlocks!.length, 0);

    listResponse = await blockBlobURL.getBlockList(Aborter.none, "uncommitted");
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks![0].name, base64encode("123"));
    assert.equal(listResponse.uncommittedBlocks![0].size, body.length);
    assert.equal(listResponse.committedBlocks!.length, 0);

    listResponse = await blockBlobURL.getBlockList(Aborter.none, "all");
    assert.equal(listResponse.committedBlocks!.length, 2);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
    assert.equal(listResponse.committedBlocks![1].name, base64encode("2"));
    assert.equal(listResponse.committedBlocks![1].size, body.length);
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks![0].name, base64encode("123"));
    assert.equal(listResponse.uncommittedBlocks![0].size, body.length);
  });

  it("upload with Readable stream body and default parameters @loki @sql", async () => {
    const body: string = getUniqueName("randomstring");
    const bodyBuffer = Buffer.from(body);

    await blockBlobURL.upload(Aborter.none, bodyBuffer, body.length);
    const result = await blobURL.download(Aborter.none, 0);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

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

  it("upload with Chinese string body and default parameters @loki @sql", async () => {
    const body: string = getUniqueName("randomstring你好");
    await blockBlobURL.upload(Aborter.none, body, Buffer.byteLength(body));
    const result = await blobURL.download(Aborter.none, 0);
    assert.deepStrictEqual(
      await bodyToString(result, Buffer.byteLength(body)),
      body
    );
  });
});
