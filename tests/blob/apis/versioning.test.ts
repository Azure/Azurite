import {
  BlobServiceClient,
  ContainerClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";

import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

/**
 * Compute a SharedKey Authorization header for raw HTTP requests.
 * Uses StorageSharedKeyCredential.computeHMACSHA256 to avoid Buffer/Uint8Array
 * type incompatibility issues with newer @types/node versions.
 */
function computeSharedKeyAuth(
  credential: StorageSharedKeyCredential,
  accountName: string,
  method: string,
  url: string,
  xmsHeaders: Record<string, string>,
  contentLength: number,
  contentType: string
): string {
  const urlObj = new URL(url);

  // Canonicalized headers (x-ms-* sorted alphabetically)
  const sorted = Object.entries(xmsHeaders)
    .map(([k, v]) => [k.toLowerCase(), v] as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalizedHeaders =
    sorted.map(([k, v]) => `${k}:${v}`).join("\n") + "\n";

  // Canonicalized resource
  let canonicalizedResource = `/${accountName}${urlObj.pathname}`;
  const paramPairs: string[] = [];
  urlObj.searchParams.forEach((v, k) => {
    paramPairs.push(`${k.toLowerCase()}:${v}`);
  });
  paramPairs.sort();
  if (paramPairs.length > 0) {
    canonicalizedResource += "\n" + paramPairs.join("\n");
  }

  const stringToSign = [
    method.toUpperCase(),
    "",             // Content-Encoding
    "",             // Content-Language
    contentLength > 0 ? contentLength.toString() : "",
    "",             // Content-MD5
    contentType,    // Content-Type
    "",             // Date (use x-ms-date)
    "",             // If-Modified-Since
    "",             // If-Match
    "",             // If-None-Match
    "",             // If-Unmodified-Since
    "",             // Range
    canonicalizedHeaders.trimEnd(),
    canonicalizedResource
  ].join("\n");

  const signature = credential.computeHMACSHA256(stringToSign);
  return `SharedKey ${accountName}:${signature}`;
}

/**
 * Enable or disable blob versioning via a raw HTTP PUT to SetBlobServiceProperties.
 */
async function setVersioningEnabled(
  serviceUrl: string,
  accountName: string,
  credential: StorageSharedKeyCredential,
  enabled: boolean
): Promise<void> {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<StorageServiceProperties>
  <Versioning>
    <Enabled>${enabled ? "true" : "false"}</Enabled>
  </Versioning>
</StorageServiceProperties>`;

  const url = `${serviceUrl}?restype=service&comp=properties`;
  const xMsDate = new Date().toUTCString();
  const xMsVersion = "2020-08-04";
  const contentType = "application/xml; charset=utf-8";
  const contentLength = Buffer.byteLength(body);

  const auth = computeSharedKeyAuth(
    credential,
    accountName,
    "PUT",
    url,
    { "x-ms-date": xMsDate, "x-ms-version": xMsVersion },
    contentLength,
    contentType
  );

  const response = await fetch(url, {
    method: "PUT",
    body,
    headers: {
      Authorization: auth,
      "Content-Type": contentType,
      "Content-Length": contentLength.toString(),
      "x-ms-date": xMsDate,
      "x-ms-version": xMsVersion
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `setVersioningEnabled failed with status ${response.status}: ${text}`
    );
  }
}

describe("BlobVersioning", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;
  const credential = new StorageSharedKeyCredential(
    EMULATOR_ACCOUNT_NAME,
    EMULATOR_ACCOUNT_KEY
  );
  const serviceClient = new BlobServiceClient(
    baseURL,
    newPipeline(credential, {
      retryOptions: { maxTries: 1 },
      keepAliveOptions: { enable: false }
    })
  );

  let containerName: string;
  let containerClient: ContainerClient;

  before(async () => {
    await server.start();
    // Enable versioning once for all tests in this suite
    await setVersioningEnabled(
      baseURL,
      EMULATOR_ACCOUNT_NAME,
      credential,
      true
    );
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  beforeEach(async () => {
    containerName = getUniqueName("container");
    containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  it("GetServiceProperties should return versioning enabled @loki", async () => {
    const props = await serviceClient.getProperties();
    // The SDK may not expose isVersioningEnabled directly, so check via raw HTTP
    const url = `${baseURL}?restype=service&comp=properties`;
    const xMsDate = new Date().toUTCString();
    const xMsVersion = "2020-08-04";
    const auth = computeSharedKeyAuth(
      credential,
      EMULATOR_ACCOUNT_NAME,
      "GET",
      url,
      { "x-ms-date": xMsDate, "x-ms-version": xMsVersion },
      0,
      ""
    );
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: auth,
        "x-ms-date": xMsDate,
        "x-ms-version": xMsVersion
      }
    });
    assert.strictEqual(response.status, 200);
    const text = await response.text();
    assert.ok(
      text.includes("<Enabled>true</Enabled>"),
      `Expected versioning to be enabled, got: ${text}`
    );
    // Sanity check that other SDK operations still work
    assert.ok(props.requestId);
  });

  it("Upload blob should return versionId when versioning is enabled @loki", async () => {
    const blobName = getUniqueName("blob");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const uploadResponse = await blockBlobClient.upload("hello", 5);
    assert.ok(
      uploadResponse.versionId,
      "Expected versionId in upload response"
    );
  });

  it("Overwriting blob should create new version and preserve old version @loki", async () => {
    const blobName = getUniqueName("blob");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload version 1
    const upload1 = await blockBlobClient.upload("version1", 8);
    const versionId1 = upload1.versionId;
    assert.ok(versionId1, "Expected versionId for first upload");

    // Upload version 2 (overwrite)
    const upload2 = await blockBlobClient.upload("version2", 8);
    const versionId2 = upload2.versionId;
    assert.ok(versionId2, "Expected versionId for second upload");
    assert.notStrictEqual(versionId1, versionId2, "VersionIds should differ");

    // Download current (version 2)
    const currentContent = await (
      await blockBlobClient.download()
    ).readableStreamBody!;
    const text = await streamToString(currentContent);
    assert.strictEqual(text, "version2");

    // Download version 1 by versionId
    const v1Content = await (
      await blockBlobClient.withVersion(versionId1!).download()
    ).readableStreamBody!;
    const v1Text = await streamToString(v1Content);
    assert.strictEqual(v1Text, "version1");
  });

  it("ListBlobsFlat with versions should show all versions @loki", async () => {
    const blobName = getUniqueName("blob");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const upload1 = await blockBlobClient.upload("v1", 2);
    const upload2 = await blockBlobClient.upload("v2", 2);

    // Without versions: only current version
    let items: string[] = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      items.push(blob.name);
    }
    assert.strictEqual(items.length, 1, "Should have 1 blob without versions filter");

    // With versions: both versions
    let versions: Array<{ name: string; versionId?: string; isCurrentVersion?: boolean }> = [];
    for await (const blob of containerClient.listBlobsFlat({ includeVersions: true })) {
      versions.push({
        name: blob.name,
        versionId: blob.versionId,
        isCurrentVersion: blob.isCurrentVersion
      });
    }
    assert.strictEqual(versions.length, 2, "Should have 2 versions");
    const current = versions.find(v => v.isCurrentVersion === true);
    const old = versions.find(v => v.isCurrentVersion === false);
    assert.ok(current, "Should have a current version");
    assert.ok(old, "Should have a previous version");
    assert.strictEqual(current!.versionId, upload2.versionId);
    assert.strictEqual(old!.versionId, upload1.versionId);
  });

  it("GetBlobProperties with versionId should return version properties @loki", async () => {
    const blobName = getUniqueName("blob");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const upload1 = await blockBlobClient.upload("v1data", 6);
    await blockBlobClient.upload("v2data", 6);

    // Get properties of old version
    const v1Props = await blockBlobClient
      .withVersion(upload1.versionId!)
      .getProperties();
    assert.strictEqual(v1Props.contentLength, 6);
    assert.strictEqual(v1Props.versionId, upload1.versionId);
  });

  it("Delete specific version should remove only that version @loki", async () => {
    const blobName = getUniqueName("blob");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const upload1 = await blockBlobClient.upload("v1", 2);
    await blockBlobClient.upload("v2", 2);

    // Delete version 1
    await blockBlobClient.withVersion(upload1.versionId!).delete();

    // Only current version (v2) should remain
    const versions: string[] = [];
    for await (const blob of containerClient.listBlobsFlat({ includeVersions: true })) {
      versions.push(blob.versionId!);
    }
    assert.strictEqual(versions.length, 1, "Should have 1 version after deleting old version");
    assert.notStrictEqual(versions[0], upload1.versionId, "Remaining version should not be the deleted one");
  });

  it("commitBlockList should return versionId when versioning is enabled @loki", async () => {
    const blobName = getUniqueName("blob");
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const blockId = Buffer.from("block1").toString("base64");
    await blockBlobClient.stageBlock(blockId, "block content", 13);
    const commitResponse = await blockBlobClient.commitBlockList([blockId]);
    assert.ok(
      commitResponse.versionId,
      "Expected versionId in commitBlockList response"
    );
  });
});

/**
 * Utility: convert a readable stream to a string.
 */
async function streamToString(
  readableStream: NodeJS.ReadableStream
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    readableStream.setEncoding("utf8");
    readableStream.on("data", (data: string) => {
      chunks.push(data);
    });
    readableStream.on("end", () => {
      resolve(chunks.join(""));
    });
    readableStream.on("error", reject);
  });
}
