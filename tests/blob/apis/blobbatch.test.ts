import {
  StorageSharedKeyCredential,
  BlobServiceClient,
  newPipeline,
  ContainerClient,
  BlobClient,
  AccountSASPermissions,
  AccountSASResourceTypes,
  AnonymousCredential,
  ContainerSASPermissions
} from "@azure/storage-blob";
import assert from "assert";
import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME, getUniqueName } from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("Blob batch API", () => {
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

  let containerName: string;
  let containerClient: ContainerClient;
  const content = "Hello World";
  let blobClients: BlobClient[];
  let blobCount = 3;

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
    blobClients = [];
    for (let i = 0; i < blobCount; ++i) {
      const blobName = getUniqueName("blob");
      const blobClient = containerClient.getBlobClient(blobName);
      const blockBlobClient = blobClient.getBlockBlobClient();
      await blockBlobClient.upload(content, content.length);
      blobClients.push(blobClient);
    }
  });

  afterEach(async () => {
    await containerClient.delete();
  });

  it("SubmitBatch batch deleting @loki @sql", async () => {
    const blobBatchClient = serviceClient.getBlobBatchClient();

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    // Submit batch request and verify response.
    const urls = blobClients.map((b) => b.url);
    const resp = await blobBatchClient.deleteBlobs(urls, sharedKeyCredential, {});
    assert.equal(resp.subResponses.length, blobCount);
    assert.equal(resp.subResponsesSucceededCount, blobCount);
    assert.equal(resp.subResponsesFailedCount, 0);

    for (let i = 0; i < blobCount; i++) {
      assert.equal(resp.subResponses[i].errorCode, undefined);
      assert.equal(resp.subResponses[i].status, 202);
      assert.ok(resp.subResponses[i].statusMessage !== "");
      assert.ok(resp.subResponses[i].headers.contains("x-ms-request-id"));
      assert.equal(resp.subResponses[i]._request.url, blobClients[i].url);
    }

    // Verify blobs deleted.
    const resp2 = (
      await containerClient
        .listBlobsFlat({
          includeSnapshots: true,
        })
        .byPage({ maxPageSize: 1 })
        .next()
    ).value;
    assert.equal(resp2.segment.blobItems.length, 0);
  });

  it("SubmitBatch within container scope - batch set tier @loki @sql", async () => {
    const blobBatchClient = containerClient.getBlobBatchClient();

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    // Submit batch request and verify response.
    const urls = blobClients.map((b) => b.url);
    const resp = await blobBatchClient.setBlobsAccessTier(urls, sharedKeyCredential, "Archive", {});
    assert.equal(resp.subResponses.length, blobCount);
    assert.equal(resp.subResponsesSucceededCount, blobCount);
    assert.equal(resp.subResponsesFailedCount, 0);

    for (let i = 0; i < blobCount; i++) {
      assert.equal(resp.subResponses[i].errorCode, undefined);
      assert.equal(resp.subResponses[i].status, 200);
      assert.ok(resp.subResponses[i].statusMessage !== "");
      assert.ok(resp.subResponses[i].headers.contains("x-ms-request-id"));
      assert.equal(resp.subResponses[i]._request.url, blobClients[i].url);
    }

    for (const blobClient of blobClients) {
      // Check blob tier set properly.
      const resp2 = await blobClient.getProperties();
      assert.equal(resp2.accessTier, "Archive");
    }
  });

  it("SubmitBatch batch set tier @loki @sql", async () => {
    const blobBatchClient = serviceClient.getBlobBatchClient();

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    // Submit batch request and verify response.
    const urls = blobClients.map((b) => b.url);
    const resp = await blobBatchClient.setBlobsAccessTier(urls, sharedKeyCredential, "Archive", {});
    assert.equal(resp.subResponses.length, blobCount);
    assert.equal(resp.subResponsesSucceededCount, blobCount);
    assert.equal(resp.subResponsesFailedCount, 0);

    for (let i = 0; i < blobCount; i++) {
      assert.equal(resp.subResponses[i].errorCode, undefined);
      assert.equal(resp.subResponses[i].status, 200);
      assert.ok(resp.subResponses[i].statusMessage !== "");
      assert.ok(resp.subResponses[i].headers.contains("x-ms-request-id"));
      assert.equal(resp.subResponses[i]._request.url, blobClients[i].url);
    }

    for (const blobClient of blobClients) {
      // Check blob tier set properly.
      const resp2 = await blobClient.getProperties();
      assert.equal(resp2.accessTier, "Archive");
    }
  });

  it("SubmitBatch within container scope - batch deleting blob in different container  @loki @sql", async () => {
    const blobBatchClient = containerClient.getBlobBatchClient();

    const containerClientNew = serviceClient.getContainerClient(getUniqueName("containernew"));
    await containerClientNew.create();

    const blockBlobClientNew = containerClientNew.getBlockBlobClient(getUniqueName("blob"));
    blockBlobClientNew.upload(content, content.length);
    const blobclientsNew: BlobClient[] = [];
    blobclientsNew.push(blockBlobClientNew);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    // Submit batch request and verify response.
    const urls = blobclientsNew.map((b) => b.url);
    const resp = await blobBatchClient.deleteBlobs(urls, sharedKeyCredential, {});
    assert.equal(resp.subResponses.length, 1);
    assert.equal(resp.subResponsesSucceededCount, 0);
    assert.equal(resp.subResponsesFailedCount, 1);
  });

  it("SubmitBatch with SAS token - batch deleting @loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    const sasUrl = serviceClient.generateAccountSasUrl(tmr,
      AccountSASPermissions.parse('d'),
      AccountSASResourceTypes.parse("o").toString());

    const sasServiceClient = new BlobServiceClient(sasUrl,
      newPipeline(
        new AnonymousCredential(),
        {
          retryOptions: { maxTries: 1 },
          // Make sure socket is closed once the operation is done.
          keepAliveOptions: { enable: false }
        }
      ));
    const blobBatchClient = sasServiceClient.getBlobBatchClient();
    const sasBlobClients: BlobClient[] = [];

    for (const blobClient of blobClients) {
      const sasBlobClient = sasServiceClient.getContainerClient(containerName).getBlobClient(blobClient.name);
      sasBlobClients.push(sasBlobClient);
    }

    // Submit batch request and verify response.
    const urls = sasBlobClients.map((b) => b.url);
    const resp = await blobBatchClient.deleteBlobs(urls, new AnonymousCredential(), {});
    assert.equal(resp.subResponses.length, blobCount);
    assert.equal(resp.subResponsesSucceededCount, blobCount);
    assert.equal(resp.subResponsesFailedCount, 0);

    for (let i = 0; i < blobCount; i++) {
      assert.equal(resp.subResponses[i].errorCode, undefined);
      assert.equal(resp.subResponses[i].status, 202);
      assert.ok(resp.subResponses[i].statusMessage !== "");
      assert.ok(resp.subResponses[i].headers.contains("x-ms-request-id"));
      assert.ok(resp.subResponses[i]._request.url.startsWith(blobClients[i].url));
    }

    // Verify blobs deleted.
    const resp2 = (
      await containerClient
        .listBlobsFlat({
          includeSnapshots: true,
        })
        .byPage({ maxPageSize: 1 })
        .next()
    ).value;
    assert.equal(resp2.segment.blobItems.length, 0);
  });

  it("SubmitBatch batch with SAS token set tier @loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    const sasUrl = serviceClient.generateAccountSasUrl(tmr,
      AccountSASPermissions.parse('w'),
      AccountSASResourceTypes.parse("o").toString());

    const sasServiceClient = new BlobServiceClient(sasUrl,
      newPipeline(
        new AnonymousCredential(),
        {
          retryOptions: { maxTries: 1 },
          // Make sure socket is closed once the operation is done.
          keepAliveOptions: { enable: false }
        }
      ));
    const blobBatchClient = sasServiceClient.getBlobBatchClient();
    const sasBlobClients: BlobClient[] = [];

    for (const blobClient of blobClients) {
      const sasBlobClient = sasServiceClient.getContainerClient(containerName).getBlobClient(blobClient.name);
      sasBlobClients.push(sasBlobClient);
    }

    // Submit batch request and verify response.
    const urls = sasBlobClients.map((b) => b.url);
    const resp = await blobBatchClient.setBlobsAccessTier(urls, new AnonymousCredential(), "Archive", {});
    assert.equal(resp.subResponses.length, blobCount);
    assert.equal(resp.subResponsesSucceededCount, blobCount);
    assert.equal(resp.subResponsesFailedCount, 0);

    for (let i = 0; i < blobCount; i++) {
      assert.equal(resp.subResponses[i].errorCode, undefined);
      assert.equal(resp.subResponses[i].status, 200);
      assert.ok(resp.subResponses[i].statusMessage !== "");
      assert.ok(resp.subResponses[i].headers.contains("x-ms-request-id"));
      assert.ok(resp.subResponses[i]._request.url.startsWith(blobClients[i].url));
    }

    for (const blobClient of blobClients) {
      // Check blob tier set properly.
      const resp2 = await blobClient.getProperties();
      assert.equal(resp2.accessTier, "Archive");
    }
  });

  it("SubmitBatch within containerScope - with SAS token - batch deleting @loki @sql", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    const sasUrl = await containerClient.generateSasUrl({
      permissions: ContainerSASPermissions.parse('rd'),
      expiresOn: tmr
    });

    const sasContainerClient = new ContainerClient(sasUrl);
    const blobBatchClient = sasContainerClient.getBlobBatchClient();
    const sasBlobClients: BlobClient[] = [];

    for (const blobClient of blobClients) {
      const sasBlobClient = sasContainerClient.getBlobClient(blobClient.name);
      sasBlobClients.push(sasBlobClient);
    }

    // Submit batch request and verify response.
    const urls = sasBlobClients.map((b) => b.url);
    const resp = await blobBatchClient.deleteBlobs(urls, new AnonymousCredential());
    assert.equal(resp.subResponses.length, blobCount);
    assert.equal(resp.subResponsesSucceededCount, blobCount);
    assert.equal(resp.subResponsesFailedCount, 0);

    for (let i = 0; i < blobCount; i++) {
      assert.equal(resp.subResponses[i].errorCode, undefined);
      assert.equal(resp.subResponses[i].status, 202);
      assert.ok(resp.subResponses[i].statusMessage !== "");
      assert.ok(resp.subResponses[i].headers.contains("x-ms-request-id"));
      assert.ok(resp.subResponses[i]._request.url.startsWith(blobClients[i].url));
    }

    // Verify blobs deleted.
    const resp2 = (
      await containerClient
        .listBlobsFlat({
          includeSnapshots: true,
        })
        .byPage({ maxPageSize: 1 })
        .next()
    ).value;
    assert.equal(resp2.segment.blobItems.length, 0);
  });

  it("SubmitBatch batch with different operations @loki @sql", async () => {
    const blobBatchClient = serviceClient.getBlobBatchClient();

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    // Submit batch request and verify response.
    const urls = blobClients.map((b) => b.url);
    const resp = await blobBatchClient.deleteBlobs(urls, sharedKeyCredential, {});
    assert.equal(resp.subResponses.length, blobCount);
    assert.equal(resp.subResponsesSucceededCount, blobCount);
    assert.equal(resp.subResponsesFailedCount, 0);

    for (let i = 0; i < blobCount; i++) {
      assert.equal(resp.subResponses[i].errorCode, undefined);
      assert.equal(resp.subResponses[i].status, 202);
      assert.ok(resp.subResponses[i].statusMessage !== "");
      assert.ok(resp.subResponses[i].headers.contains("x-ms-request-id"));
      assert.equal(resp.subResponses[i]._request.url, blobClients[i].url);
    }

    // Verify blobs deleted.
    const resp2 = (
      await containerClient
        .listBlobsFlat({
          includeSnapshots: true,
        })
        .byPage({ maxPageSize: 1 })
        .next()
    ).value;
    assert.equal(resp2.segment.blobItems.length, 0);
  });
});