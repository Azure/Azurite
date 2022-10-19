import { BlobServiceClient, newPipeline } from "@azure/storage-blob";

import * as assert from "assert";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import { generateJWTToken, getUniqueName } from "../testutils";
import { SimpleTokenCredential } from "../simpleTokenCredential";
import { BlobClient } from "@azure/storage-blob";
import { BlobBatch } from "@azure/storage-blob";

// Set true to enable debug log
configLogger(false);

describe("Blob OAuth Basic", () => {
  const factory = new BlobTestServerFactory();
  let server = factory.createServer(false, false, true, "basic");
  const baseURL = `https://${server.config.host}:${server.config.port}/devstoreaccount1`;

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it(`Should work with create container @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://storage.azure.com",
      "user_impersonation"
    );

    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    await containerClient.create();
    await containerClient.delete();
  });
  
  it(`Should work with blob batch deleting @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://storage.azure.com",
      "user_impersonation"
    );

    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    await containerClient.create();

    const blobClients: BlobClient[] = [];
    const blobCount = 3;
    const content = "Hello World";

    for (let i = 0; i < blobCount; ++i) {
      const blobName = getUniqueName("blob");
      const blobClient = containerClient.getBlobClient(blobName);
      const blockBlobClient = blobClient.getBlockBlobClient();
      await blockBlobClient.upload(content, content.length);
      blobClients.push(blobClient);
    }

    const blobBatchClient = serviceClient.getBlobBatchClient();
    // Assemble batch delete request.
    const batchDeleteRequest = new BlobBatch();
    for (let i = 0; i < blobCount; i++) {
      await batchDeleteRequest.deleteBlob(blobClients[i]);
    }

    // Submit batch request and verify response.
    const resp = await blobBatchClient.submitBatch(batchDeleteRequest, {});
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
  
  it(`Should work with blob batch set tier @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://storage.azure.com",
      "user_impersonation"
    );

    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    await containerClient.create();

    const blobClients: BlobClient[] = [];
    const blobCount = 3;
    const content = "Hello World";

    for (let i = 0; i < blobCount; ++i) {
      const blobName = getUniqueName("blob");
      const blobClient = containerClient.getBlobClient(blobName);
      const blockBlobClient = blobClient.getBlockBlobClient();
      await blockBlobClient.upload(content, content.length);
      blobClients.push(blobClient);
    }

    const blobBatchClient = serviceClient.getBlobBatchClient();
    // Assemble batch delete request.
    const batchRequest = new BlobBatch();
    for (let i = 0; i < blobCount; i++) {
      await batchRequest.setBlobAccessTier(blobClients[i], "Archive");
    }

    // Submit batch request and verify response.
    const resp = await blobBatchClient.submitBatch(batchRequest, {});
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

  it(`Should not work with invalid JWT token @loki @sql`, async () => {
    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential("invalid token"), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    try {
      await containerClient.create();
      await containerClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      return;
    }
    assert.fail();
  });

  it(`Should work with valid audiences @loki @sql`, async () => {
    const audiences = [
      "https://storage.azure.com",
      "https://storage.azure.com/",
      "e406a681-f3d4-42a8-90b6-c2b029497af1",
      "https://devstoreaccount1.blob.core.windows.net",
      "https://devstoreaccount1.blob.core.windows.net/",
      "https://devstoreaccount1.blob.core.chinacloudapi.cn",
      "https://devstoreaccount1.blob.core.chinacloudapi.cn/",
      "https://devstoreaccount1.blob.core.usgovcloudapi.net",
      "https://devstoreaccount1.blob.core.usgovcloudapi.net/",
      "https://devstoreaccount1.blob.core.cloudapi.de",
      "https://devstoreaccount1.blob.core.cloudapi.de/"
    ];

    for (const audience of audiences) {
      const token = generateJWTToken(
        new Date("2019/01/01"),
        new Date("2019/01/01"),
        new Date("2100/01/01"),
        "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
        audience,
        "user_impersonation"
      );

      const serviceClient = new BlobServiceClient(
        baseURL,
        newPipeline(new SimpleTokenCredential(token), {
          retryOptions: { maxTries: 1 },
          // Make sure socket is closed once the operation is done.
          keepAliveOptions: { enable: false }
        })
      );

      const containerName: string = getUniqueName("1container-with-dash");
      const containerClient = serviceClient.getContainerClient(containerName);

      await containerClient.create();
      await containerClient.delete();
    }
  });

  it(`Should not work with invalid audiences @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://invalidaccount.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    try {
      await containerClient.create();
      await containerClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      assert.deepStrictEqual(err.details.AuthenticationErrorDetail.includes("audience"), true);
      return;
    }
    assert.fail();
  });

  it(`Should work with valid issuers @loki @sql`, async () => {
    const issuerPrefixes = [
      "https://sts.windows.net/",
      "https://sts.microsoftonline.de/",
      "https://sts.chinacloudapi.cn/",
      "https://sts.windows-ppe.net"
    ];

    for (const issuerPrefix of issuerPrefixes) {
      const token = generateJWTToken(
        new Date("2019/01/01"),
        new Date("2019/01/01"),
        new Date("2100/01/01"),
        `${issuerPrefix}/ab1f708d-50f6-404c-a006-d71b2ac7a606/`,
        "e406a681-f3d4-42a8-90b6-c2b029497af1",
        "user_impersonation"
      );

      const serviceClient = new BlobServiceClient(
        baseURL,
        newPipeline(new SimpleTokenCredential(token), {
          retryOptions: { maxTries: 1 },
          // Make sure socket is closed once the operation is done.
          keepAliveOptions: { enable: false }
        })
      );

      const containerName: string = getUniqueName("1container-with-dash");
      const containerClient = serviceClient.getContainerClient(containerName);

      await containerClient.create();
      await containerClient.delete();
    }
  });

  it(`Should not work with invalid issuers @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://invalidissuer/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://invalidaccount.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    try {
      await containerClient.create();
      await containerClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      assert.deepStrictEqual(err.details.AuthenticationErrorDetail.includes("issuer"), true);
      return;
    }
    assert.fail();
  });

  it(`Should not work with invalid nbf @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2119/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    try {
      await containerClient.create();
      await containerClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      assert.deepStrictEqual(err.details.AuthenticationErrorDetail.includes("Lifetime"), true);
      return;
    }
    assert.fail();
  });

  it(`Should not work with invalid exp @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    try {
      await containerClient.create();
      await containerClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      assert.deepStrictEqual(err.details.AuthenticationErrorDetail.includes("expire"), true);
      return;
    }
    assert.fail();
  });

  it(`Should not work with get container ACL @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    try {
      await containerClient.getAccessPolicy();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      await containerClient.delete();
      return;
    }
    await containerClient.delete();
    assert.fail();
  });

  it(`Should not work with set container ACL @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceClient = new BlobServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    try {
      await containerClient.setAccessPolicy("container");
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      await containerClient.delete();
      return;
    }
    await containerClient.delete();
    assert.fail();
  });

  it(`Should not work with HTTP @loki @sql`, async () => {
    await server.close();
    await server.clean();

    server = factory.createServer(false, false, false, "basic");
    await server.start();

    const httpBaseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;

    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceClient = new BlobServiceClient(
      httpBaseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerClient = serviceClient.getContainerClient(containerName);

    try {
      await containerClient.create();
      await containerClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Bearer token authentication is not permitted"),
        true
      );
      assert.deepStrictEqual(err.message.includes("non-https"), true);
      return;
    }
    assert.fail();
  });
});
