import { ContainerClient } from "@azure/storage-blob";
import * as assert from "assert";

import { BlobFixture } from "./dataFixtures";
import { assertByteIdentical } from "./integrity";

/**
 * Uploads a fixture using the blob type (block/append/page) it declares, so
 * every scenario that seeds blob fixtures (npm process, Docker, ...)
 * exercises all three blob persistence paths identically.
 */
export async function uploadBlobFixture(
  containerClient: ContainerClient,
  fixture: BlobFixture
): Promise<void> {
  if (fixture.blobType === "block") {
    const blockBlobClient = containerClient.getBlockBlobClient(fixture.name);
    await blockBlobClient.upload(fixture.content, fixture.content.length, {
      blobHTTPHeaders: { blobContentType: fixture.contentType }
    });
  } else if (fixture.blobType === "append") {
    const appendBlobClient = containerClient.getAppendBlobClient(
      fixture.name
    );
    await appendBlobClient.create({
      blobHTTPHeaders: { blobContentType: fixture.contentType }
    });
    // Split into two append blocks to exercise multi-block append persistence.
    const half = Math.floor(fixture.content.length / 2);
    await appendBlobClient.appendBlock(
      fixture.content.subarray(0, half),
      half
    );
    await appendBlobClient.appendBlock(
      fixture.content.subarray(half),
      fixture.content.length - half
    );
  } else {
    const pageBlobClient = containerClient.getPageBlobClient(fixture.name);
    await pageBlobClient.create(fixture.content.length, {
      blobHTTPHeaders: { blobContentType: fixture.contentType }
    });
    await pageBlobClient.uploadPages(
      fixture.content,
      0,
      fixture.content.length
    );
  }
}

/**
 * Downloads a fixture's blob and asserts it matches byte-for-byte and by
 * content-type, regardless of which blob type it was uploaded as.
 */
export async function assertBlobFixtureSurvived(
  containerClient: ContainerClient,
  fixture: BlobFixture
): Promise<void> {
  const blobClient = containerClient.getBlobClient(fixture.name);
  const exists = await blobClient.exists();
  assert.ok(exists, `Blob ${fixture.name} did not survive the upgrade`);

  const downloaded = await blobClient.downloadToBuffer();
  assertByteIdentical(
    downloaded,
    fixture.content,
    `Blob content mismatch for ${fixture.name} (${fixture.blobType} blob)`
  );

  const properties = await blobClient.getProperties();
  assert.strictEqual(
    properties.contentType,
    fixture.contentType,
    `Content-Type mismatch for ${fixture.name}`
  );
}
