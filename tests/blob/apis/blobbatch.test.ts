import {
  StorageSharedKeyCredential,
  BlobServiceClient,
  newPipeline,
  ContainerClient,
  BlobClient,
  AccountSASPermissions,
  AccountSASResourceTypes,
  AnonymousCredential,
  ContainerSASPermissions,
  BaseRequestPolicy,
  WebResource
} from "@azure/storage-blob";
import assert from "assert";
import { Transform } from "stream";
import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME, getTestServerBaseURL, getUniqueName } from "../../testutils";

type BatchRequestTransform = (contentType: string, boundary: string) => {
  contentType: string;
  boundary?: string;
};

class BatchRequestPolicyFactory {
  public responseBody = "";

  public constructor(private readonly transform: BatchRequestTransform) { }

  public create(nextPolicy: any, options: any) {
    return new BatchRequestPolicy(
      nextPolicy,
      options,
      this.transform,
      responseBody => this.responseBody = responseBody
    );
  }
}

class BatchRequestPolicy extends BaseRequestPolicy {
  public constructor(
    nextPolicy: any,
    options: any,
    private readonly transform: BatchRequestTransform,
    private readonly captureResponseBody: (responseBody: string) => void
  ) {
    super(nextPolicy, options);
  }

  public async sendRequest(request: WebResource) {
    if (request.url.includes("comp=batch")) {
      const contentType = request.headers.get("content-type")!;
      const boundary = contentType.match(/boundary=([^;]+)/)![1];
      const transformed = this.transform(contentType, boundary);
      if (transformed.contentType === "") {
        request.headers.remove("content-type");
      } else {
        request.headers.set("content-type", transformed.contentType);
      }

      if (transformed.boundary !== undefined) {
        request.body = request.body.replaceAll(boundary, transformed.boundary);
        request.headers.set("content-length", Buffer.byteLength(request.body).toString());
      }
    }

    const response = await this._nextPolicy.sendRequest(request);
    if (request.url.includes("comp=batch") && response.readableStreamBody) {
      const chunks: Buffer[] = [];
      const captureStream = new Transform({
        transform(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback(undefined, chunk);
        },
        flush: callback => {
          this.captureResponseBody(Buffer.concat(chunks).toString());
          callback();
        }
      });
      response.readableStreamBody = response.readableStreamBody.pipe(captureStream);
    }

    return response;
  }
}

// Set true to enable debug log
configLogger(false);

describe("Blob batch API", () => {
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

    const sharedKeyCredential = (serviceClient as any).credential as StorageSharedKeyCredential;

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

  it("SubmitBatch accepts a boundary containing equals signs @loki @sql", async () => {
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      { retryOptions: { maxTries: 1 }, keepAliveOptions: { enable: false } }
    );
    pipeline.factories.unshift(new BatchRequestPolicyFactory((contentType, boundary) => {
      const updatedBoundary = `${boundary}==`;
      return {
        contentType: contentType.replace(boundary, updatedBoundary),
        boundary: updatedBoundary
      };
    }));
    const client = new BlobServiceClient(baseURL, pipeline);
    const blobBatchClient = client.getBlobBatchClient();
    const sharedKeyCredential = (client as any).credential as StorageSharedKeyCredential;

    const response = await blobBatchClient.deleteBlobs(
      [client.getContainerClient(containerName).getBlobClient(blobClients[0].name).url],
      sharedKeyCredential,
      {}
    );

    assert.equal(response.subResponsesSucceededCount, 1);
    assert.equal(response.subResponses[0].status, 202);
  });

  it("SubmitBatch rejects missing Content-Type @loki @sql", async () => {
    const pipeline = newPipeline(
      new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      { retryOptions: { maxTries: 1 }, keepAliveOptions: { enable: false } }
    );
    pipeline.factories.unshift(new BatchRequestPolicyFactory(() => ({ contentType: "" })));
    const client = new BlobServiceClient(baseURL, pipeline);
    const blobBatchClient = client.getBlobBatchClient();
    const sharedKeyCredential = (client as any).credential as StorageSharedKeyCredential;

    try {
      await blobBatchClient.deleteBlobs(
        [client.getContainerClient(containerName).getBlobClient(blobClients[0].name).url],
        sharedKeyCredential,
        {}
      );
      assert.fail("Expected the batch request to fail");
    } catch (error) {
      assert.equal((error as any).statusCode, 400);
    }
  });

  const invalidContentTypes = [
    { name: "Content-Type without a boundary", contentType: "multipart/mixed" },
    { name: "an empty boundary", contentType: "multipart/mixed; boundary=" },
    { name: "duplicate boundary parameters", contentType: "multipart/mixed; boundary=a; boundary=b" }
  ];

  for (const testCase of invalidContentTypes) {
    it(`SubmitBatch rejects ${testCase.name} @loki @sql`, async () => {
      const pipeline = newPipeline(
        new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
        { retryOptions: { maxTries: 1 }, keepAliveOptions: { enable: false } }
      );
      const requestPolicy = new BatchRequestPolicyFactory(() => ({ contentType: testCase.contentType }));
      pipeline.factories.unshift(requestPolicy);
      const client = new BlobServiceClient(baseURL, pipeline);
      const blobBatchClient = client.getBlobBatchClient();
      const sharedKeyCredential = (client as any).credential as StorageSharedKeyCredential;

      const response = await blobBatchClient.deleteBlobs(
        [client.getContainerClient(containerName).getBlobClient(blobClients[0].name).url],
        sharedKeyCredential,
        {}
      );

      assert.equal(response.subResponsesFailedCount, 1);
      assert.ok(
        requestPolicy.responseBody.includes(
          "x-ms-error-code: InvalidHeaderValue"
        ),
        requestPolicy.responseBody
      );
    });
  }

  it("SubmitBatch within container scope - batch set tier @loki @sql", async () => {
    const blobBatchClient = containerClient.getBlobBatchClient();

    const sharedKeyCredential = (serviceClient as any).credential as StorageSharedKeyCredential;

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

    const sharedKeyCredential = (serviceClient as any).credential as StorageSharedKeyCredential;

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

    const sharedKeyCredential = (serviceClient as any).credential as StorageSharedKeyCredential;

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

    const sharedKeyCredential = (serviceClient as any).credential as StorageSharedKeyCredential;

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