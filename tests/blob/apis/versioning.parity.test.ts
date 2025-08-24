import * as assert from "assert";
import {
  BlobServiceClient,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  bodyToString,
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";

// Set to true when you want to debug the emulator
configLogger(false);

describe("Blob Versioning Parity Tests", () => {
  let factory: BlobTestServerFactory;
  let server: any;
  let azuriteServiceClient: BlobServiceClient;
  let realServiceClient: BlobServiceClient;
  let containerName: string;

  // Azure Storage Account URL - set via environment variable AZURE_STORAGE_ACCOUNT_URL
  // or configure in .env.local file for local development
  const realStorageAccountUrl =
    "https://your-storage-account.blob.core.windows.net";

  before(async () => {
    // Initialize Azurite (emulator) server and client
    factory = new BlobTestServerFactory();
    server = factory.createServer(false, false, false, undefined, true);
    await server.start();

    const credential = new StorageSharedKeyCredential(
      EMULATOR_ACCOUNT_NAME,
      EMULATOR_ACCOUNT_KEY
    );
    azuriteServiceClient = new BlobServiceClient(
      `http://${server.config.host}:${server.config.port}/${EMULATOR_ACCOUNT_NAME}`,
      credential
    );

    // Initialize real Azure Storage client with DefaultAzureCredential
    realServiceClient = new BlobServiceClient(
      realStorageAccountUrl,
      new DefaultAzureCredential()
    );
  });

  beforeEach(async () => {
    // Create unique container name for each test
    containerName = getUniqueName("versioning-parity");

    // Create containers on both services
    await azuriteServiceClient
      .getContainerClient(containerName)
      .createIfNotExists();
    await realServiceClient
      .getContainerClient(containerName)
      .createIfNotExists();
  });

  after(async () => {
    // Clean up server
    if (server) {
      await server.close();
      await server.clean();
    }
  });

  // Test upload, delete, and version retrieval parity
  it("should upload, delete, and retrieve blob versions consistently", async () => {
    const blobName = getUniqueName("test-blob");
    const content = "Hello, versioning world!";

    // Get block blob clients for both services
    const azuriteBlockBlobClient = azuriteServiceClient
      .getContainerClient(containerName)
      .getBlockBlobClient(blobName);
    const realBlockBlobClient = realServiceClient
      .getContainerClient(containerName)
      .getBlockBlobClient(blobName);

    // Upload blob to both services
    const azuriteUploadResult = await azuriteBlockBlobClient.upload(
      content,
      content.length
    );
    const realUploadResult = await realBlockBlobClient.upload(
      content,
      content.length
    );

    // Both should return version IDs
    assert.ok(
      azuriteUploadResult.versionId,
      "Azurite upload should return version ID"
    );
    assert.ok(
      realUploadResult.versionId,
      "Real storage upload should return version ID"
    );

    console.log(`Azurite version ID: ${azuriteUploadResult.versionId}`);
    console.log(`Real storage version ID: ${realUploadResult.versionId}`);

    // Delete blobs from both services (this should create delete markers)
    await azuriteBlockBlobClient.delete();
    await realBlockBlobClient.delete();

    // Verify blobs are no longer accessible without version
    await assert.rejects(
      azuriteBlockBlobClient.download(),
      "Azurite blob should not be accessible after delete without version"
    );
    await assert.rejects(
      realBlockBlobClient.download(),
      "Real storage blob should not be accessible after delete without version"
    );

    // Retrieve blobs using their original version IDs
    const azuriteVersionedClient = azuriteServiceClient
      .getContainerClient(containerName)
      .getBlobClient(blobName)
      .withVersion(azuriteUploadResult.versionId!);
    const realVersionedClient = realServiceClient
      .getContainerClient(containerName)
      .getBlobClient(blobName)
      .withVersion(realUploadResult.versionId!);

    // Download versioned blobs
    const azuriteVersionedDownload = await azuriteVersionedClient.download();
    const realVersionedDownload = await realVersionedClient.download();

    // Verify content is preserved
    const azuriteVersionedContent = await bodyToString(
      azuriteVersionedDownload
    );
    const realVersionedContent = await bodyToString(realVersionedDownload);

    assert.strictEqual(
      azuriteVersionedContent,
      content,
      "Azurite versioned content should match original"
    );
    assert.strictEqual(
      realVersionedContent,
      content,
      "Real storage versioned content should match original"
    );
    assert.strictEqual(
      azuriteVersionedContent,
      realVersionedContent,
      "Both services should return identical content"
    );

    console.log("✅ Successfully retrieved deleted blobs using version IDs");
    console.log(`Content: "${azuriteVersionedContent}"`);
  });
});
