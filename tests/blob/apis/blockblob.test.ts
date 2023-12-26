import {
  StorageSharedKeyCredential,
  BlobServiceClient,
  newPipeline,
  BlobSASPermissions
} from "@azure/storage-blob";
import assert = require("assert");
import crypto = require("crypto");

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
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  it("upload with string body and default parameters @loki @sql", async () => {
    const body: string = getUniqueName("randomstring");
    const result_upload = await blockBlobClient.upload(body, body.length);
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );
    const result = await blobClient.download(0);
    assert.deepStrictEqual(await bodyToString(result, body.length), body);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("upload empty blob @loki @sql", async () => {
    await blockBlobClient.upload("", 0);
    const result = await blobClient.download(0);
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
    const result_upload = await blockBlobClient.upload(body, body.length, {
      blobHTTPHeaders: options,
      metadata: options.metadata
    });
    assert.equal(
      result_upload._response.request.headers.get("x-ms-client-request-id"),
      result_upload.clientRequestId
    );
    const result = await blobClient.download(0);
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
    const result_stage = await blockBlobClient.stageBlock(
      base64encode("1"),
      body,
      body.length
    );
    assert.equal(
      result_stage._response.request.headers.get("x-ms-client-request-id"),
      result_stage.clientRequestId
    );
    await blockBlobClient.stageBlock(base64encode("2"), body, body.length);

    // TODO: azure/storage-blob 12.9.0 will fail on  list uncimmited blob from container, will skip following code until this is fix in SDK or Azurite
    // const listBlobResponse = await (
    //   await containerClient
    //     .listBlobsFlat({ includeUncommitedBlobs: true })
    //     .byPage()
    //     .next()
    // ).value;
    // assert.equal(listBlobResponse.segment.blobItems.length, 1);
    // assert.deepStrictEqual(
    //   listBlobResponse.segment.blobItems[0].properties.contentLength,
    //   0
    // );

    const listResponse = await blockBlobClient.getBlockList("uncommitted");
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

  it("stageBlock with double commit block should work @loki @sql", async () => {
    const body = "HelloWorld";

    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);

    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);

    // TODO: azure/storage-blob 12.9.0 will fail on  list uncimmited blob from container, will skip following code until this is fix in SDK or Azurite
    // const listBlobResponse = (
    //   await containerClient
    //     .listBlobsFlat({ includeUncommitedBlobs: true })
    //     .byPage()
    //     .next()
    // ).value;
    // assert.equal(listBlobResponse.segment.blobItems.length, 1);
    // assert.deepStrictEqual(
    //   listBlobResponse.segment.blobItems[0].properties.contentLength,
    //   0
    // );

    const listResponse = await blockBlobClient.getBlockList("uncommitted");
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.uncommittedBlocks![0].size, body.length);
    assert.equal(
      listResponse._response.request.headers.get("x-ms-client-request-id"),
      listResponse.clientRequestId
    );
  });

  it("stageBlock with wrong body should throw md5 mismatch @loki @sql", async () => {
    const body = "HelloWorld";
    const md5 = new Uint8Array(Buffer.from("anotherBody"));
    const options = { transactionalContentMD5: md5 };

    try {
      await blockBlobClient.stageBlock(
        base64encode("1"),
        body,
        body.length,
        options
      );
    } catch (e) {
      assert.equal(e.name, "RestError");
      assert.equal(e.statusCode, 400);
      assert.equal(
        e.details.message.indexOf("Provided contentMD5 doesn't match."),
        0
      );
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("stageBlock with md5 hash check @loki @sql", async () => {
    const body = "HelloWorld";
    const md5 = crypto.createHash("md5").update(body, "utf8").digest();
    const options = {
      transactionalContentMD5: new Uint8Array(Buffer.from(md5))
    };

    await blockBlobClient.stageBlock(
      base64encode("1"),
      body,
      body.length,
      options
    );

    const listResponse = await blockBlobClient.getBlockList("uncommitted");
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.uncommittedBlocks![0].size, body.length);
  });

  it("commitBlockList @loki @sql", async () => {
    const body = "HelloWorld";
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);
    await blockBlobClient.stageBlock(base64encode("2"), body, body.length);
    const result_commit = await blockBlobClient.commitBlockList([
      base64encode("1"),
      base64encode("2")
    ]);
    assert.equal(
      result_commit._response.request.headers.get("x-ms-client-request-id"),
      result_commit.clientRequestId
    );
    const listResponse = await blockBlobClient.getBlockList("committed");
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
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);
    await blockBlobClient.stageBlock(base64encode("2"), body, body.length);
    const result_commit = await blockBlobClient.commitBlockList([
      base64encode("1"),
      base64encode("2")
    ]);
    assert.equal(
      result_commit._response.request.headers.get("x-ms-client-request-id"),
      result_commit.clientRequestId
    );

    const properties1 = await blockBlobClient.getProperties();
    assert.notDeepStrictEqual(properties1.createdOn, undefined);

    const listResponse = await blockBlobClient.getBlockList("committed");
    assert.equal(listResponse.committedBlocks!.length, 2);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
    assert.equal(listResponse.committedBlocks![1].name, base64encode("2"));
    assert.equal(listResponse.committedBlocks![1].size, body.length);
    assert.equal(
      listResponse._response.request.headers.get("x-ms-client-request-id"),
      listResponse.clientRequestId
    );

    await blockBlobClient.commitBlockList([base64encode("2")]);
    const listResponse2 = await blockBlobClient.getBlockList("committed");
    assert.equal(listResponse2.committedBlocks!.length, 1);
    assert.equal(listResponse2.committedBlocks![0].name, base64encode("2"));
    assert.equal(listResponse2.committedBlocks![0].size, body.length);

    const properties2 = await blockBlobClient.getProperties();
    assert.notDeepStrictEqual(properties2.createdOn, undefined);
    assert.deepStrictEqual(properties1.createdOn, properties2.createdOn);
  });

  it("commitBlockList with empty list should create an empty block blob @loki @sql", async () => {
    await blockBlobClient.commitBlockList([]);

    const listResponse = await blockBlobClient.getBlockList("committed");
    assert.equal(listResponse.committedBlocks!.length, 0);

    const result = await blobClient.download(0);
    assert.deepStrictEqual(await bodyToString(result, 0), "");
    assert.equal(true, result._response.headers.contains("x-ms-creation-time"));
  });

  it("commitBlockList with empty list should not work with ifNoneMatch=* for existing blob @loki @sql", async () => {
    await blockBlobClient.commitBlockList([]);

    try {
      await blockBlobClient.commitBlockList([], {
        conditions: {
          ifNoneMatch: "*"
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 409);
      return;
    }

    assert.fail();
  });

  it("upload should not work with ifNoneMatch=* for existing blob @loki @sql", async () => {
    await blockBlobClient.commitBlockList([]);

    try {
      await blockBlobClient.upload("hello", 5, {
        conditions: {
          ifNoneMatch: "*"
        }
      });
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 409);
      return;
    }

    assert.fail();
  });

  it("commitBlockList with all parameters set @loki @sql", async () => {
    const body = "HelloWorld";
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);
    await blockBlobClient.stageBlock(base64encode("2"), body, body.length);

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
    await blockBlobClient.commitBlockList(
      [base64encode("1"), base64encode("2")],
      {
        blobHTTPHeaders: options,
        metadata: options.metadata
      }
    );

    const listResponse = await blockBlobClient.getBlockList("committed");
    assert.equal(listResponse.committedBlocks!.length, 2);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
    assert.equal(listResponse.committedBlocks![1].name, base64encode("2"));
    assert.equal(listResponse.committedBlocks![1].size, body.length);

    const result = await blobClient.download(0);
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
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);
    await blockBlobClient.stageBlock(base64encode("2"), body, body.length);
    await blockBlobClient.commitBlockList([base64encode("2")]);
    const listResponse = await blockBlobClient.getBlockList("all");
    assert.equal(listResponse.committedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks!.length, 0);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("2"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
  });

  it("getBlockList_BlockListingFilter @loki @sql", async () => {
    const body = "HelloWorld";
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);
    await blockBlobClient.stageBlock(base64encode("2"), body, body.length);

    // Getproperties on a block blob without commited block will return 404
    let err;
    try {
      await blockBlobClient.getProperties();
    } catch (error) {
      err = error;
    }
    assert.deepStrictEqual(err.statusCode, 404);

    // Stage block with block Id length different than the exist uncommited blocks will fail with 400
    try {
      await blockBlobClient.stageBlock(base64encode("123"), body, body.length);
    } catch (error) {
      err = error;
    }
    assert.deepStrictEqual(err.statusCode, 400);

    await blockBlobClient.commitBlockList([
      base64encode("1"),
      base64encode("2")
    ]);

    await blockBlobClient.stageBlock(base64encode("123"), body, body.length);

    let listResponse = await blockBlobClient.getBlockList("committed");
    assert.equal(listResponse.committedBlocks!.length, 2);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
    assert.equal(listResponse.committedBlocks![1].name, base64encode("2"));
    assert.equal(listResponse.committedBlocks![1].size, body.length);
    assert.equal(listResponse.uncommittedBlocks!.length, 0);

    listResponse = await blockBlobClient.getBlockList("uncommitted");
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks![0].name, base64encode("123"));
    assert.equal(listResponse.uncommittedBlocks![0].size, body.length);
    assert.equal(listResponse.committedBlocks!.length, 0);

    listResponse = await blockBlobClient.getBlockList("all");
    assert.equal(listResponse.committedBlocks!.length, 2);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
    assert.equal(listResponse.committedBlocks![1].name, base64encode("2"));
    assert.equal(listResponse.committedBlocks![1].size, body.length);
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks![0].name, base64encode("123"));
    assert.equal(listResponse.uncommittedBlocks![0].size, body.length);
  });

  it("getBlockList for non-existent blob @loki @sql", async () => {
    try {
      await blockBlobClient.getBlockList("committed");
    } catch (error) {
      assert.deepEqual(404, error.statusCode);
      return;
    }
    assert.fail();
  });

  it("getBlockList for non-existent container @loki @sql", async () => {
    const fakeContainer = getUniqueName("container");
    const fakeContainerClient = serviceClient.getContainerClient(fakeContainer);
    const fakeBlobClient = fakeContainerClient.getBlobClient(blobName);
    const fakeBlockBlobClient = fakeBlobClient.getBlockBlobClient();

    try {
      await fakeBlockBlobClient.getBlockList("committed");
    } catch (error) {
      assert.deepEqual(404, error.statusCode);
      return;
    }
    assert.fail();
  });

  it("getBlockList from snapshot @loki @sql", async () => {
    const body = "HelloWorld";
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);
    await blockBlobClient.stageBlock(base64encode("2"), body, body.length);
    await blockBlobClient.commitBlockList([base64encode("1")]);

    // Create blob snapshot
    const result = await blobClient.createSnapshot();
    assert.ok(result.snapshot);
    const blobSnapshotURL = blockBlobClient.withSnapshot(result.snapshot!);
    await blobSnapshotURL.getProperties();

    // Update base blob
    await blockBlobClient.stageBlock(base64encode("3"), body, body.length);
    await blockBlobClient.stageBlock(base64encode("4"), body, body.length);
    await blockBlobClient.commitBlockList([
      base64encode("3"),
      base64encode("4")
    ]);

    const listResponse = await blobSnapshotURL.getBlockList("all");
    assert.equal(listResponse.committedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks!.length, 0);
    assert.equal(listResponse.committedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.committedBlocks![0].size, body.length);
  });

  it("upload with Readable stream body and default parameters @loki @sql", async () => {
    const body: string = getUniqueName("randomstring");
    const bodyBuffer = Buffer.from(body);

    await blockBlobClient.upload(bodyBuffer, body.length);
    const result = await blobClient.download(0);
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
    await blockBlobClient.upload(body, Buffer.byteLength(body));
    const result = await blobClient.download(0);
    assert.deepStrictEqual(
      await bodyToString(result, Buffer.byteLength(body)),
      body
    );
  });

  it("Start copy without required permission should fail @loki @sql", async () => {
    const body: string = getUniqueName("randomstring");
    const expiryTime = new Date();
    expiryTime.setDate(expiryTime.getDate() + 1);
    await blockBlobClient.upload(body, Buffer.byteLength(body));

    const sourceURLWithoutPermission = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("w"),
      expiresOn: expiryTime
    });

    const destBlobName: string = getUniqueName("destBlobName");
    const destBlobClient = containerClient.getBlockBlobClient(destBlobName);

    try {
      await destBlobClient.beginCopyFromURL(sourceURLWithoutPermission);
      assert.fail("Copy without required permision should fail");
    }
    catch (ex) {
      assert.deepStrictEqual(ex.statusCode, 403);
      assert.ok(ex.message.startsWith("This request is not authorized to perform this operation using this permission."));
      assert.deepStrictEqual(ex.code, "CannotVerifyCopySource");
    }

    // Copy within the same account without SAS token should succeed.
    const result = await (await destBlobClient.beginCopyFromURL(blockBlobClient.url)).pollUntilDone();
    assert.ok(result.copyId);
    assert.strictEqual(result.errorCode, undefined);

    // Copy with 'r' permission should succeed.
    const sourceURL = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: expiryTime
    });

    const resultWithPermission = await (await destBlobClient.beginCopyFromURL(sourceURL)).pollUntilDone();
    assert.ok(resultWithPermission.copyId);
    assert.strictEqual(resultWithPermission.errorCode, undefined);
  });

});
