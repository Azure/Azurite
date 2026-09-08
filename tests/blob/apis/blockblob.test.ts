import {
  StorageSharedKeyCredential,
  BlobServiceClient,
  newPipeline,
  BlobSASPermissions,
  Tags
} from "@azure/storage-blob";
import CustomHeaderPolicyFactory from "../RequestPolicy/CustomHeaderPolicyFactory";
import axios from "axios";
import * as assert from "assert";
import * as crypto from "crypto";
import * as zlib from "zlib";

import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  base64encode,
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getTestServerBaseURL,
  getUniqueName,
  sleep
} from "../../testutils";
import {
  getCRC64FromString,
  getMD5FromString
} from "../../../src/common/utils/utils";

// Set true to enable debug log
configLogger(false);

describe("BlockBlobAPIs", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();

  const baseURL = getTestServerBaseURL(server);
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

  // Temporary helper: The SDK's TypeScript wrapper does not expose some
  // checksum headers on BlockBlobUploadOptions yet, so tests inject raw HTTP
  // headers through a custom pipeline policy. Remove this once the TypeScript
  // wrapper surfaces these headers on the public options type.
  function getBlockBlobClientWithRawHeaders(
    container: string,
    blob: string,
    headers: Array<{ key: string; value: string }>
  ) {
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 },
        keepAliveOptions: { enable: false }
      }
    );
    for (const header of headers) {
      pipeline.factories.unshift(
        new CustomHeaderPolicyFactory(header.key, header.value)
      );
    }

    const customClient = new BlobServiceClient(baseURL, pipeline);
    return customClient.getContainerClient(container).getBlockBlobClient(blob);
  }

  it("Block blob upload should refresh lease state @loki @sql", async () => {
    await blockBlobClient.upload('a', 1);

    const leaseId = "abcdefg";
    const blobLeaseClient = await blockBlobClient.getBlobLeaseClient(leaseId);
    await blobLeaseClient.acquireLease(20);

    // Waiting for 20 seconds for lease to expire
    await sleep(20000);

    await blockBlobClient.upload('b', 1);

    try {
      await blobLeaseClient.renewLease();
      assert.fail();
    }
    catch (error) {
      assert.deepStrictEqual(error.code, "LeaseIdMismatchWithLeaseOperation");
      assert.deepStrictEqual(error.statusCode, 409);
    }
  });

  it("Block blob upload with ifTags should work @loki @sql", async () => {
    await blockBlobClient.upload('a', 1);

    const tags: Tags = {
      tag1: 'val1',
      tag2: 'val2'
    }

    await blockBlobClient.setTags(tags);

    try {
      await blockBlobClient.upload('b', 1, {
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

  it("upload (PutBlob) with correct crc64 should succeed @loki @sql", async () => {
    const body = "HelloWorld";
    const crc64 = getCRC64FromString(body);
    const clientWithCrc64 = getBlockBlobClientWithRawHeaders(containerName, blobName, [
      {
        key: "x-ms-content-crc64",
        value: Buffer.from(crc64.buffer, crc64.byteOffset, crc64.byteLength).toString("base64")
      }
    ]);
    const result = await clientWithCrc64.upload(body, body.length);
    assert.equal(result._response.status, 201);

    const downloaded = await blobClient.download(0);
    assert.deepStrictEqual(await bodyToString(downloaded, body.length), body);
  });

  it("upload (PutBlob) with wrong crc64 should throw mismatch @loki @sql", async () => {
    const body = "HelloWorld";
    const wrongCrc64 = getCRC64FromString("differentBody");
    const clientWithWrongCrc64 = getBlockBlobClientWithRawHeaders(containerName, blobName, [
      {
        key: "x-ms-content-crc64",
        value: Buffer.from(wrongCrc64.buffer, wrongCrc64.byteOffset, wrongCrc64.byteLength).toString("base64")
      }
    ]);
    try {
      await clientWithWrongCrc64.upload(body, body.length);
    } catch (e) {
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, "Crc64Mismatch");
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("upload (PutBlob) with wrong md5 should throw mismatch @loki @sql", async () => {
    const body = "HelloWorld";
    const wrongMd5 = crypto.createHash("md5").update("differentBody", "utf8").digest();
    const clientWithWrongMd5 = getBlockBlobClientWithRawHeaders(containerName, blobName, [
      {
        key: "content-md5",
        value: wrongMd5.toString("base64")
      }
    ]);
    try {
      await clientWithWrongMd5.upload(body, body.length);
    } catch (e) {
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, "Md5Mismatch");
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("upload (PutBlob) x-ms-blob-content-md5 takes precedence over Content-MD5 @loki @sql", async () => {
    // Per the Put Blob REST contract, x-ms-blob-content-md5 takes precedence
    // over Content-MD5 for transit integrity verification on BlockBlob.
    // - Content-MD5 wrong + x-ms-blob-content-md5 correct  -> success
    // - Content-MD5 correct + x-ms-blob-content-md5 wrong  -> Md5Mismatch
    const body = "HelloWorld";
    const correctMd5 = crypto.createHash("md5").update(body, "utf8").digest();
    const wrongMd5 = crypto.createHash("md5").update("differentBody", "utf8").digest();

    const clientWithWrongContentAndCorrectBlobMd5 =
      getBlockBlobClientWithRawHeaders(containerName, blobName, [
        {
          key: "content-md5",
          value: wrongMd5.toString("base64")
        },
        {
          key: "x-ms-blob-content-md5",
          value: correctMd5.toString("base64")
        }
      ]);

    // Wrong transactional + correct blob-content-md5 -> success.
    await clientWithWrongContentAndCorrectBlobMd5.upload(body, body.length);

    const clientWithCorrectContentAndWrongBlobMd5 =
      getBlockBlobClientWithRawHeaders(containerName, blobName, [
        {
          key: "content-md5",
          value: correctMd5.toString("base64")
        },
        {
          key: "x-ms-blob-content-md5",
          value: wrongMd5.toString("base64")
        }
      ]);

    // Correct transactional + wrong blob-content-md5 -> Md5Mismatch.
    try {
      await clientWithCorrectContentAndWrongBlobMd5.upload(body, body.length);
      assert.fail("Expected Md5Mismatch when x-ms-blob-content-md5 is wrong.");
    } catch (e) {
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, "Md5Mismatch");
    }
  });

  it("upload (PutBlob) with wrong-length x-ms-blob-content-md5 should be rejected @loki @sql", async () => {
    // x-ms-blob-content-md5 must decode to exactly 16 bytes. Verified live:
    // real Azure rejects wrong-length values with InvalidMd5 (not
    // InvalidHeaderValue, despite x-ms-blob-content-md5 being a property
    // header). Azurite routes all MD5 sources through the same validator.
    const body = "HelloWorld";
    const wrongLength = new Uint8Array([0, 0, 0, 0]);
    try {
      await blockBlobClient.upload(body, body.length, {
        blobHTTPHeaders: { blobContentMD5: wrongLength }
      });
    } catch (e: any) {
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, "InvalidMd5");
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("upload (PutBlob) with both md5 and crc64 supplied should be rejected @loki @sql", async () => {
    // Real Azure rejects requests that supply both Content-MD5 and
    // x-ms-content-crc64 - Azurite must match.
    const body = "HelloWorld";
    const md5 = crypto.createHash("md5").update(body, "utf8").digest();
    const crc64 = getCRC64FromString(body);
    const clientWithCrc64AndMd5 = getBlockBlobClientWithRawHeaders(containerName, blobName, [
      {
        key: "x-ms-content-crc64",
        value: Buffer.from(crc64.buffer, crc64.byteOffset, crc64.byteLength).toString("base64")
      },
      {
        key: "content-md5",
        value: md5.toString("base64")
      }
    ]);
    try {
      await clientWithCrc64AndMd5.upload(body, body.length);
    } catch (e) {
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, "BothCrc64AndMd5HeaderPresent");
      return;
    }
    assert.fail("Did not throw an exception.");
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

  it("upload should fail when metadata names are invalid C# identifiers @loki @sql", async () => {
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
        await blockBlobClient.upload('b', 1, {
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

    // TODO: azure/storage-blob 12.9.0 will fail on  list uncommitted blob from container, will skip following code until this is fix in SDK or Azurite
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

  it("stageBlockFromURL @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    const resultStage = await blockBlobClient.stageBlockFromURL(
      base64encode("1"),
      sourceUrl,
      0,
      10
    );
    const expectedMD5 = await getMD5FromString(content.substring(0, 10));
    assert.deepStrictEqual(
      Buffer.from(resultStage.contentMD5!),
      Buffer.from(expectedMD5)
    );

    await blockBlobClient.stageBlockFromURL(
      base64encode("2"),
      sourceUrl,
      10,
      content.length - 10
    );

    const listResponse = await blockBlobClient.getBlockList("uncommitted");
    assert.equal(listResponse.uncommittedBlocks!.length, 2);
    assert.equal(listResponse.uncommittedBlocks![0].size, 10);
    assert.equal(
      listResponse.uncommittedBlocks![1].size,
      content.length - 10
    );

    await blockBlobClient.commitBlockList([
      base64encode("1"),
      base64encode("2")
    ]);
    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, content.length), content);
  });

  it("stageBlockFromURL without range copies the entire source @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    await blockBlobClient.stageBlockFromURL(base64encode("1"), sourceUrl);
    await blockBlobClient.commitBlockList([base64encode("1")]);
    const result = await blobClient.download(0);
    assert.equal(await bodyToString(result, content.length), content);
  });

  it("stageBlockFromURL rejects an unmet source condition @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    // @azure/storage-blob does not expose x-ms-source-if-* on
    // stageBlockFromURL, so issue the request directly.
    const destinationUrl = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("rw"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });
    const response = await axios.put(
      destinationUrl +
        "&comp=block&blockid=" +
        encodeURIComponent(base64encode("1")),
      undefined,
      {
        headers: {
          "x-ms-copy-source": sourceUrl,
          "x-ms-source-if-match": '"0x0000000000000000"',
          "Content-Length": "0"
        },
        validateStatus: () => true
      }
    );
    assert.deepStrictEqual(response.status, 412);
    assert.ok(response.data.includes("SourceConditionNotMet"));
  });

  it("stageBlockFromURL rejects a request body @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });
    const destinationUrl = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("rw"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    const response = await axios.put(
      destinationUrl +
        "&comp=block&blockid=" +
        encodeURIComponent(base64encode("1")),
      "unexpected body",
      {
        headers: {
          "x-ms-copy-source": sourceUrl
        },
        validateStatus: () => true
      }
    );
    assert.deepStrictEqual(response.status, 400);
    assert.ok(response.data.includes("InvalidHeaderValue"));
  });

  it("stageBlockFromURL rejects a malformed source range @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });
    const destinationUrl = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("rw"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    for (const badRange of [
      "bytes=abc",
      "bytes=5-2",
      "0-10",
      // end < start detectable only beyond double precision: both offsets
      // round to 2^53 as Numbers, hiding that the range is inverted
      "bytes=9007199254740993-9007199254740992"
    ]) {
      const response = await axios.put(
        destinationUrl +
          "&comp=block&blockid=" +
          encodeURIComponent(base64encode("1")),
        undefined,
        {
          headers: {
            "x-ms-copy-source": sourceUrl,
            "x-ms-source-range": badRange,
            "Content-Length": "0"
          },
          validateStatus: () => true
        }
      );
      assert.deepStrictEqual(response.status, 400, badRange);
      assert.ok(response.data.includes("InvalidHeaderValue"), badRange);
    }
  });

  it("stageBlockFromURL with product-style source URL @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceName = getUniqueName("source");
    const sourceClient = containerClient.getBlockBlobClient(sourceName);
    await sourceClient.upload(content, content.length);
    const sourceSasQuery = (await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    })).split("?")[1];
    const destinationSasQuery = (await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("rw"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    })).split("?")[1];

    // Both requests use product-style URLs, where the account comes from
    // the Host header rather than the path.
    const productHost =
      `${EMULATOR_ACCOUNT_NAME}.localhost:${server.config.port}`;
    const response = await axios.put(
      `http://${server.config.host}:${server.config.port}` +
        `/${containerName}/${blobName}?${destinationSasQuery}` +
        "&comp=block&blockid=" +
        encodeURIComponent(base64encode("1")),
      undefined,
      {
        headers: {
          host: productHost,
          "x-ms-copy-source":
            `http://${productHost}/${containerName}/${sourceName}` +
            `?${sourceSasQuery}`,
          "Content-Length": "0"
        },
        validateStatus: () => true
      }
    );
    assert.deepStrictEqual(response.status, 201);

    const listResponse = await blockBlobClient.getBlockList("uncommitted");
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks![0].size, content.length);
  });

  it("stageBlockFromURL accepts a mixed-case Host header @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceName = getUniqueName("source");
    const sourceClient = containerClient.getBlockBlobClient(sourceName);
    await sourceClient.upload(content, content.length);
    const sourceSasQuery = (await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    })).split("?")[1];
    const destinationSasQuery = (await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("rw"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    })).split("?")[1];

    // Host headers are case-insensitive; the lowercase source URL host
    // must match despite the client's casing.
    const response = await axios.put(
      `http://${server.config.host}:${server.config.port}` +
        `/${EMULATOR_ACCOUNT_NAME}/${containerName}/${blobName}` +
        `?${destinationSasQuery}` +
        "&comp=block&blockid=" +
        encodeURIComponent(base64encode("1")),
      undefined,
      {
        headers: {
          host: `LocalHost:${server.config.port}`,
          "x-ms-copy-source":
            `http://localhost:${server.config.port}` +
            `/${EMULATOR_ACCOUNT_NAME}/${containerName}/${sourceName}` +
            `?${sourceSasQuery}`,
          "Content-Length": "0"
        },
        validateStatus: () => true
      }
    );
    assert.deepStrictEqual(response.status, 201);
  });

  it("stageBlockFromURL from a missing source returns 404 @loki @sql", async () => {
    const missingClient = containerClient.getBlockBlobClient(
      getUniqueName("missing")
    );
    const sourceUrl = await missingClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    try {
      await blockBlobClient.stageBlockFromURL(
        base64encode("1"),
        sourceUrl
      );
      assert.fail();
    } catch (err: any) {
      assert.deepStrictEqual(err.statusCode, 404);
      assert.deepStrictEqual(err.details.errorCode, "CannotVerifyCopySource");
    }
  });

  it("stageBlockFromURL stages the stored bytes when the source declares Content-Encoding: gzip @loki @sql", async () => {
    // A blob's Content-Encoding is stored metadata, not a description of how
    // the body is framed on the wire, so the download echoes it back over the
    // raw stored bytes. Staging must copy those bytes verbatim rather than
    // decoding them, otherwise the block holds the decompressed content.
    const raw = zlib.gzipSync(Buffer.from("HelloWorldFromSourceBlob"));
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(raw, raw.length, {
      blobHTTPHeaders: { blobContentEncoding: "gzip" }
    });
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    await blockBlobClient.stageBlockFromURL(base64encode("1"), sourceUrl);

    const listResponse = await blockBlobClient.getBlockList("uncommitted");
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks![0].size, raw.length);

    await blockBlobClient.commitBlockList([base64encode("1")]);
    const download = await blockBlobClient.download(0);
    const chunks: Buffer[] = [];
    for await (const chunk of download.readableStreamBody!) {
      chunks.push(Buffer.from(chunk));
    }
    assert.deepStrictEqual(
      Buffer.concat(chunks),
      raw,
      "Staged block must be the source's stored bytes, not the decoded ones"
    );
  });

  it("stageBlockFromURL succeeds when the source's Content-Encoding does not match its bytes @loki @sql", async () => {
    // Nothing validates that a blob's stored Content-Encoding describes its
    // content, so a plain body can be labelled gzip. Staging must not try to
    // decode it (see issue #646 for the same hazard on copy).
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length, {
      blobHTTPHeaders: { blobContentEncoding: "gzip" }
    });
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    await blockBlobClient.stageBlockFromURL(base64encode("1"), sourceUrl);

    const listResponse = await blockBlobClient.getBlockList("uncommitted");
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks![0].size, content.length);

    await blockBlobClient.commitBlockList([base64encode("1")]);
    const result = await blockBlobClient.download(0);
    assert.equal(await bodyToString(result, content.length), content);
  });

  it("stageBlockFromURL with matching sourceContentMD5 @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    const md5 = crypto.createHash("md5").update(content, "utf8").digest();
    const resultStage = await blockBlobClient.stageBlockFromURL(
      base64encode("1"),
      sourceUrl,
      0,
      content.length,
      { sourceContentMD5: new Uint8Array(md5) }
    );

    // The response echoes the MD5 the service computed over the staged
    // content, which for a matching request equals the supplied value.
    assert.deepStrictEqual(
      Buffer.from(resultStage.contentMD5!),
      Buffer.from(md5)
    );
    // The two checksums are mutually exclusive, so no CRC64 is reported
    // alongside an MD5, matching stageBlock.
    assert.strictEqual((resultStage as any).xMsContentCrc64, undefined);

    const listResponse = await blockBlobClient.getBlockList("uncommitted");
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
  });

  it("stageBlockFromURL with wrong sourceContentMD5 should throw md5 mismatch @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    // Stage one good block first, so the block list below distinguishes "the
    // rejected block was not staged" from "the blob does not exist yet".
    await blockBlobClient.stageBlockFromURL(
      base64encode("1"),
      sourceUrl,
      0,
      content.length
    );

    // A valid 16-byte MD5 of a *different* body, to exercise the mismatch
    // path rather than the InvalidMd5 (wrong-length) path.
    const md5 = crypto.createHash("md5").update("anotherBody", "utf8").digest();

    try {
      await blockBlobClient.stageBlockFromURL(
        base64encode("2"),
        sourceUrl,
        0,
        content.length,
        { sourceContentMD5: new Uint8Array(md5) }
      );
    } catch (e) {
      assert.equal(e.name, "RestError");
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, "Md5Mismatch");

      // A rejected block must not be staged.
      const listResponse = await blockBlobClient.getBlockList("uncommitted");
      assert.equal(listResponse.uncommittedBlocks!.length, 1);
      assert.equal(
        listResponse.uncommittedBlocks![0].name,
        base64encode("1")
      );
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("stageBlockFromURL with wrong-length sourceContentMD5 should be rejected @loki @sql", async () => {
    // x-ms-source-content-md5 must decode to exactly 16 bytes. This test pins
    // which error code the service returns for a malformed (4-byte) value so
    // Azurite can be verified against real Azure.
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    const wrongLengthMd5 = new Uint8Array([0, 0, 0, 0]);

    try {
      await blockBlobClient.stageBlockFromURL(
        base64encode("1"),
        sourceUrl,
        0,
        content.length,
        { sourceContentMD5: wrongLengthMd5 }
      );
    } catch (e) {
      assert.equal(e.name, "RestError");
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, "InvalidMd5");
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("stageBlockFromURL with matching sourceContentCrc64 @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    const crc64 = Buffer.from(getCRC64FromString(content)).toString("base64");
    const targetClient = getBlockBlobClientWithRawHeaders(
      containerName,
      getUniqueName("target"),
      [{ key: "x-ms-source-content-crc64", value: crc64 }]
    );

    const resultStage = await targetClient.stageBlockFromURL(
      base64encode("1"),
      sourceUrl,
      0,
      content.length
    );

    // The response reports the CRC64 the service computed over the staged
    // content, as stageBlock does.
    assert.equal(
      Buffer.from((resultStage as any).xMsContentCrc64!).toString("base64"),
      crc64
    );

    const listResponse = await targetClient.getBlockList("uncommitted");
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
  });

  it("stageBlockFromURL with wrong sourceContentCrc64 should throw crc64 mismatch @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    // A valid 8-byte CRC64 of a *different* body, to exercise the mismatch
    // path rather than the malformed-header path.
    const crc64 = Buffer.from(getCRC64FromString("anotherBody")).toString(
      "base64"
    );
    const targetClient = getBlockBlobClientWithRawHeaders(
      containerName,
      getUniqueName("target"),
      [{ key: "x-ms-source-content-crc64", value: crc64 }]
    );

    try {
      await targetClient.stageBlockFromURL(
        base64encode("1"),
        sourceUrl,
        0,
        content.length
      );
    } catch (e) {
      assert.equal(e.name, "RestError");
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, "Crc64Mismatch");
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("stageBlockFromURL with wrong-length sourceContentCrc64 should be rejected @loki @sql", async () => {
    // x-ms-source-content-crc64 must decode to at least 8 bytes. This test
    // pins which error code the service returns for a malformed (4-byte)
    // value so Azurite can be verified against real Azure.
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    const targetClient = getBlockBlobClientWithRawHeaders(
      containerName,
      getUniqueName("target"),
      [
        {
          key: "x-ms-source-content-crc64",
          value: Buffer.from([1, 2, 3, 4]).toString("base64")
        }
      ]
    );

    try {
      await targetClient.stageBlockFromURL(
        base64encode("1"),
        sourceUrl,
        0,
        content.length
      );
    } catch (e) {
      assert.equal(e.name, "RestError");
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, "InvalidHeaderValue");
      // The error must name the header the caller actually sent, not the
      // transactional x-ms-content-crc64 the shared validator reports.
      assert.equal(
        /<HeaderName>([^<]*)</.exec(e.response?.bodyAsText ?? "")?.[1],
        "x-ms-source-content-crc64"
      );
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("stageBlockFromURL with both source md5 and crc64 should be rejected @loki @sql", async () => {
    const content = "HelloWorldFromSourceBlob";
    const sourceClient = containerClient.getBlockBlobClient(
      getUniqueName("source")
    );
    await sourceClient.upload(content, content.length);
    const sourceUrl = await sourceClient.generateSasUrl({
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: new Date(Date.now() + 60 * 60 * 1000)
    });

    // Both checksums are correct for the source content; supplying the two
    // together is rejected regardless, as on the real service.
    const md5 = Buffer.from(await getMD5FromString(content)).toString("base64");
    const crc64 = Buffer.from(getCRC64FromString(content)).toString("base64");
    const targetClient = getBlockBlobClientWithRawHeaders(
      containerName,
      getUniqueName("target"),
      [
        { key: "x-ms-source-content-md5", value: md5 },
        { key: "x-ms-source-content-crc64", value: crc64 }
      ]
    );

    try {
      await targetClient.stageBlockFromURL(
        base64encode("1"),
        sourceUrl,
        0,
        content.length
      );
    } catch (e) {
      assert.equal(e.name, "RestError");
      assert.equal(e.statusCode, 400);
      assert.equal(e.code, "BothCrc64AndMd5HeaderPresent");
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("stageBlock with double commit block should work @loki @sql", async () => {
    const body = "HelloWorld";

    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);

    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);

    // TODO: azure/storage-blob 12.9.0 will fail on  list uncommitted blob from container, will skip following code until this is fix in SDK or Azurite
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
    // A valid 16-byte MD5 of a *different* body, to exercise the mismatch
    // path rather than the InvalidMd5 (wrong-length) path.
    const md5 = crypto.createHash("md5").update("anotherBody", "utf8").digest();
    const options = { transactionalContentMD5: new Uint8Array(md5) };

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
      assert.equal(e.code, "Md5Mismatch");
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("stageBlock with wrong-length MD5 should be rejected @loki @sql", async () => {
    // Content-MD5 must decode to exactly 16 bytes. This test pins which error
    // code the service returns for a malformed (4-byte) MD5 header so Azurite
    // can be verified against real Azure.
    const body = "HelloWorld";
    const wrongLengthMd5 = new Uint8Array([0, 0, 0, 0]);
    const options = { transactionalContentMD5: wrongLengthMd5 };

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
      assert.equal(e.code, "InvalidMd5");
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("stageBlock with md5 hash check @loki @sql", async () => {
    const body = "HelloWorld";
    const md5 = crypto.createHash("md5").update(body, "utf8").digest();
    const options = {
      transactionalContentMD5: new Uint8Array(md5)
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

  it("stageBlock with correct crc64 should succeed @loki @sql", async () => {
    const body = "HelloWorld";
    const crc64 = getCRC64FromString(body);
    const options = { transactionalContentCrc64: new Uint8Array(crc64) };

    const result = await blockBlobClient.stageBlock(
      base64encode("1"),
      body,
      body.length,
      options
    );

    assert.equal(result._response.status, 201);
    // Server must echo back the CRC64 it validated against
    assert.ok(
      result.xMsContentCrc64 !== undefined,
      "Response should include x-ms-content-crc64"
    );
    assert.deepStrictEqual(
      Buffer.from(result.xMsContentCrc64!),
      Buffer.from(crc64),
      "Echoed CRC64 must match what was sent"
    );

    const listResponse = await blockBlobClient.getBlockList("uncommitted");
    assert.equal(listResponse.uncommittedBlocks!.length, 1);
    assert.equal(listResponse.uncommittedBlocks![0].name, base64encode("1"));
    assert.equal(listResponse.uncommittedBlocks![0].size, body.length);
  });

  it("stageBlock with wrong-length CRC64 should be rejected @loki @sql", async () => {
    // x-ms-content-crc64 must decode to at least 8 bytes (CRC-64 is 64-bit).
    // Real Azure rejects shorter values with InvalidHeaderValue; this test
    // pins that contract for Azurite.
    const body = "HelloWorld";
    const wrongLengthCrc64 = new Uint8Array([0, 0, 0, 0]);
    const options = { transactionalContentCrc64: wrongLengthCrc64 };

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
      assert.equal(e.code, "InvalidHeaderValue");
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("stageBlock with wrong body should throw crc64 mismatch @loki @sql", async () => {
    const body = "HelloWorld";
    // Provide CRC64 of a different payload - server must reject the upload
    const wrongCrc64 = getCRC64FromString("differentBody");
    const options = { transactionalContentCrc64: new Uint8Array(wrongCrc64) };

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
      assert.equal(e.code, "Crc64Mismatch");
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("stageBlock with both md5 and crc64 supplied should be rejected @loki @sql", async () => {
    // Real Azure rejects requests that supply both Content-MD5 and
    // x-ms-content-crc64 - Azurite must match.
    const body = "HelloWorld";
    const md5 = crypto.createHash("md5").update(body, "utf8").digest();
    const crc64 = getCRC64FromString(body);
    const options = {
      transactionalContentMD5: new Uint8Array(md5),
      transactionalContentCrc64: new Uint8Array(crc64)
    };

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
      assert.equal(e.code, "BothCrc64AndMd5HeaderPresent");
      return;
    }
    assert.fail("Did not throw an exception.");
  });

  it("stageBlock ignores x-ms-blob-content-md5 (not a Put Block REST header) @loki @sql", async () => {
    // Per the Put Block REST contract, x-ms-blob-content-md5 is NOT a Put Block
    // header. Real Azure silently ignores it (even when malformed). Azurite
    // must match: a bogus x-ms-blob-content-md5 must not cause validation or
    // an error.
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      { retryOptions: { maxTries: 1 }, keepAliveOptions: { enable: false } }
    );
    pipeline.factories.unshift(
      new CustomHeaderPolicyFactory("x-ms-blob-content-md5", "AAAAAAAAAAA=")
    );
    const altClient = new BlobServiceClient(baseURL, pipeline)
      .getContainerClient(containerName)
      .getBlockBlobClient(blobName);

    const result = await altClient.stageBlock(base64encode("1"), "HelloWorld", 10);
    assert.equal(result._response.status, 201);
  });

  it("stageBlock without any checksum header should still echo computed crc64 @loki @sql", async () => {
    // Per the Put Block REST contract, the service computes a CRC64 of the
    // block and returns it in x-ms-content-crc64 even when the client didn't
    // supply one. The echoed value must match the canonical CRC-64/NVME.
    const body = "HelloWorld";
    const result = await blockBlobClient.stageBlock(
      base64encode("1"),
      body,
      body.length
    );
    assert.equal(result._response.status, 201);
    assert.deepStrictEqual(
      Buffer.from(result.xMsContentCrc64!),
      Buffer.from(getCRC64FromString(body))
    );
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

  it("commitBlockList should return versionId as undefined @loki @sql", async () => {
    const body = "HelloWorld";
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);
    await blockBlobClient.stageBlock(base64encode("2"), body, body.length);
    const commitResponse = await blockBlobClient.commitBlockList([
      base64encode("1"),
      base64encode("2")
    ]);
    assert.strictEqual(commitResponse.versionId, undefined);

    const properties = await blockBlobClient.getProperties();
    assert.strictEqual(properties.versionId, undefined);

    const downloadResponse = await blobClient.download(0);
    assert.strictEqual(downloadResponse.versionId, undefined);
  });

  it("commitBlockList with ifTags @loki @sql", async () => {
    const body = "HelloWorld";
    await blockBlobClient.upload(body, 10);
    const tags: Tags = {
      key1: 'value1'
    };
    await blockBlobClient.setTags(tags);
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);
    await blockBlobClient.stageBlock(base64encode("2"), body, body.length);
    try {
      await blockBlobClient.commitBlockList([
        base64encode("1"),
        base64encode("2")
      ], {
        conditions: {
          tagConditions: `key1<>'value1'`
        }
      });
      assert.fail("Should not reach here.");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }
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

  it("download a 0 size block blob with range > 0 will get error @loki @sql", async () => {
    await blockBlobClient.commitBlockList([]);

    const listResponse = await blockBlobClient.getBlockList("committed");
    assert.equal(listResponse.committedBlocks!.length, 0);

    try {
      await blockBlobClient.download(0, 3);
    } catch (error) {
      assert.deepStrictEqual(error.statusCode, 416);
      assert.deepStrictEqual(error.response.headers.get("content-range"), 'bytes */0')
      return;
    }
    assert.fail();
  });

  it("Download a blob range should only return ContentMD5 when has request header x-ms-range-get-content-md5  @loki @sql", async () => {
    blockBlobClient.deleteIfExists();

    await blockBlobClient.upload("abc", 0);

    const properties1 = await blockBlobClient.getProperties();
    assert.deepEqual(properties1.contentMD5, await getMD5FromString("abc"));

    let result = await blockBlobClient.download(0, 6);
    assert.deepStrictEqual(await bodyToString(result, 3), "abc");
    assert.deepStrictEqual(result.contentLength, 3);
    assert.deepEqual(result.contentMD5, undefined);
    assert.deepEqual(result.blobContentMD5, await getMD5FromString("abc"));

    result = await blockBlobClient.download();
    assert.deepStrictEqual(await bodyToString(result, 3), "abc");
    assert.deepStrictEqual(result.contentLength, 3);
    assert.deepEqual(result.contentMD5, await getMD5FromString("abc"));
    assert.deepEqual(result.blobContentMD5, await getMD5FromString("abc"));

    result = await blockBlobClient.download(0, 1, { rangeGetContentMD5: true });
    assert.deepStrictEqual(await bodyToString(result, 1), "a");
    assert.deepStrictEqual(result.contentLength, 1);
    assert.deepEqual(result.contentMD5, await getMD5FromString("a"));
    assert.deepEqual(result.blobContentMD5, await getMD5FromString("abc"));
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

  it("getBlockList with ifTags @loki @sql", async () => {
    const body = "HelloWorld";
    await blockBlobClient.upload(body, 10);
    const tags: Tags = {
      key1: 'value1'
    };
    await blockBlobClient.setTags(tags);
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);
    await blockBlobClient.stageBlock(base64encode("2"), body, body.length);
    await blockBlobClient.commitBlockList([
      base64encode("1"),
      base64encode("2")
    ]);

    try {
      await blockBlobClient.getBlockList("all", {
        conditions: {
          tagConditions: `key1<>'value1'`
        }
      });
      assert.fail("Should not reach here.");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 412);
      assert.deepStrictEqual((err as any).code, 'ConditionNotMet');
      assert.deepStrictEqual((err as any).details.errorCode, 'ConditionNotMet');
      assert.ok((err as any).details.message.startsWith('The condition specified using HTTP conditional header(s) is not met.'));
    }
  });

  it("getBlockList_BlockListingFilter @loki @sql", async () => {
    const body = "HelloWorld";
    await blockBlobClient.stageBlock(base64encode("1"), body, body.length);
    await blockBlobClient.stageBlock(base64encode("2"), body, body.length);

    // Getproperties on a block blob without committed block will return 404
    let err;
    try {
      await blockBlobClient.getProperties();
    } catch (error) {
      err = error;
    }
    assert.deepStrictEqual(err.statusCode, 404);

    // Stage block with block Id length different than the exist uncommitted blocks will fail with 400
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

  it("getBlockList for nonexistent blob @loki @sql", async () => {
    try {
      await blockBlobClient.getBlockList("committed");
    } catch (error) {
      assert.deepEqual(404, error.statusCode);
      return;
    }
    assert.fail();
  });

  it("getBlockList for nonexistent container @loki @sql", async () => {
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
      assert.fail("Copy without required permission should fail");
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
