import {
  BlobServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";
import * as crypto from "crypto";

import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  base64encode,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getTestServerBaseURL,
  getUniqueName
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

// Regression coverage for issue #1967: downloading a blob composed of many
// extents used to open one file handle per extent up front, exhausting the OS
// file-handle limit. FSExtentStore.readExtents now streams the extents lazily,
// one at a time. These tests build a blob spanning many extents and verify the
// merged read still returns the exact bytes, including across extent boundaries.
describe("Blob download across many extents", () => {
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

  const blockCount = 128;
  const blockSize = 256;

  let containerName: string = getUniqueName("container");
  let containerClient = serviceClient.getContainerClient(containerName);
  let blobName: string = getUniqueName("blob");
  let blockBlobClient = containerClient.getBlockBlobClient(blobName);
  let expected = Buffer.alloc(0);

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
    blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Each committed block becomes its own extent chunk, so the blob is spread
    // across `blockCount` extents that the download must merge back together.
    const blockIds: string[] = [];
    const parts: Buffer[] = [];
    for (let i = 0; i < blockCount; i++) {
      const blockId = base64encode(String(i).padStart(6, "0"));
      const body = crypto.randomBytes(blockSize);
      blockIds.push(blockId);
      parts.push(body);
      await blockBlobClient.stageBlock(blockId, body, blockSize);
    }
    await blockBlobClient.commitBlockList(blockIds);
    expected = Buffer.concat(parts);
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  it("returns the full blob content merged from every extent @loki @sql", async () => {
    const response = await blockBlobClient.download(0);
    const downloaded = await streamToBuffer(response.readableStreamBody!);

    assert.strictEqual(downloaded.length, expected.length);
    assert.ok(
      downloaded.equals(expected),
      "Full download should match the uploaded blocks"
    );
  });

  it("returns a range that spans multiple extent boundaries @loki @sql", async () => {
    // Start partway through one extent and end partway through another so the
    // lazy read has to trim the first and last extents and stream the ones in
    // between.
    const offset = blockSize + blockSize / 2; // middle of the 2nd extent
    const length = blockSize * 4 + blockSize / 2; // spans into a later extent

    const response = await blockBlobClient.download(offset, length);
    const downloaded = await streamToBuffer(response.readableStreamBody!);

    assert.ok(
      downloaded.equals(expected.subarray(offset, offset + length)),
      "Ranged download should match the corresponding slice of the blob"
    );
  });
});

async function streamToBuffer(
  stream: NodeJS.ReadableStream
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", data =>
      chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data))
    );
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
