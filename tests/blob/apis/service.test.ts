import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  BlobServiceClient,
  generateAccountSASQueryParameters,
  newPipeline,
  SASProtocol,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import * as assert from "assert";

import {
  EMULATOR_ACCOUNT_ISHIERARCHICALNAMESPACEENABLED,
  EMULATOR_ACCOUNT_KIND,
  EMULATOR_ACCOUNT_SKUNAME
} from "../../../src/blob/utils/constants";
import { configLogger } from "../../../src/common/Logger";
import BlobTestServerFactory from "../../BlobTestServerFactory";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("ServiceAPIs", () => {
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

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it(`getUserDelegationKey with Key credential should fail @loki @sql`, async () => {    
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - 1);
    const expiryTime = new Date();
    expiryTime.setDate(expiryTime.getDate() + 1);
    
    try {
      await serviceClient.getUserDelegationKey(startTime, expiryTime);
      assert.fail("Should fail to invoke getUserDelegationKey with account key credentials")
    } catch (error) {
      assert.strictEqual((error as any).details.AuthenticationErrorDetail, "Only authentication scheme Bearer is supported");
    }
  });

  it(`getUserDelegationKey with SAS token credential should fail @loki @sql`, async () => {
    const sasTokenStart = new Date();
    sasTokenStart.setHours(sasTokenStart.getHours() - 1);
    
    const sasTokenExpiry = new Date();
    sasTokenExpiry.setDate(sasTokenExpiry.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        startsOn: sasTokenStart,
        expiresOn: sasTokenExpiry,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString(),
      },
      sharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasClient = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new BlobServiceClient(sasClient, newPipeline());

    const skStart = new Date();
    skStart.setHours(skStart.getHours() - 1);
    
    const skExpiry = new Date();
    skExpiry.setDate(skExpiry.getDate() + 1);
    
    try {      
      await serviceClientWithSAS.getUserDelegationKey(skStart, skExpiry);
      assert.fail("Should fail to invoke getUserDelegationKey with SAS token credentials")
    } catch (error) {
      assert.strictEqual((error as any).details.AuthenticationErrorDetail, "Only authentication scheme Bearer is supported");
    }
  });

  it("GetServiceProperties @loki @sql", async () => {
    const result = await serviceClient.getProperties();

    assert.ok(typeof result.requestId);
    assert.ok(result.requestId!.length > 0);
    assert.ok(typeof result.version);
    assert.ok(result.version!.length > 0);

    if (result.cors && result.cors!.length > 0) {
      assert.ok(result.cors![0].allowedHeaders.length >= 0);
      assert.ok(result.cors![0].allowedMethods.length > 0);
      assert.ok(result.cors![0].allowedOrigins.length > 0);
      assert.ok(result.cors![0].exposedHeaders.length >= 0);
      assert.ok(result.cors![0].maxAgeInSeconds >= 0);
    }
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("Set CORS with empty AllowedHeaders, ExposedHeaders @loki @sql", async () => {
    const serviceProperties = await serviceClient.getProperties();

    const newCORS = {
      allowedHeaders: "",
      allowedMethods: "GET",
      allowedOrigins: "example.com",
      exposedHeaders: "",
      maxAgeInSeconds: 8888
    };

    serviceProperties.cors = [newCORS];

    await serviceClient.setProperties(serviceProperties);

    const result = await serviceClient.getProperties();
    assert.deepStrictEqual(result.cors![0], newCORS);
  });

  it("SetServiceProperties @loki @sql", async () => {
    const serviceProperties = await serviceClient.getProperties();

    serviceProperties.blobAnalyticsLogging = {
      deleteProperty: true,
      read: true,
      retentionPolicy: {
        days: 5,
        enabled: true
      },
      version: "1.0",
      write: true
    };

    serviceProperties.minuteMetrics = {
      enabled: true,
      includeAPIs: true,
      retentionPolicy: {
        days: 4,
        enabled: true
      },
      version: "1.0"
    };

    serviceProperties.hourMetrics = {
      enabled: true,
      includeAPIs: true,
      retentionPolicy: {
        days: 3,
        enabled: true
      },
      version: "1.0"
    };

    const newCORS = {
      allowedHeaders: "*",
      allowedMethods: "GET",
      allowedOrigins: "example.com",
      exposedHeaders: "*",
      maxAgeInSeconds: 8888
    };
    if (!serviceProperties.cors) {
      serviceProperties.cors = [newCORS];
    } else if (serviceProperties.cors!.length < 5) {
      serviceProperties.cors.push(newCORS);
    }

    if (!serviceProperties.deleteRetentionPolicy) {
      serviceProperties.deleteRetentionPolicy = {
        days: 2,
        enabled: false
      };
    }

    const result_set = await serviceClient.setProperties(serviceProperties);
    assert.equal(
      result_set._response.request.headers.get("x-ms-client-request-id"),
      result_set.clientRequestId
    );

    const result = await serviceClient.getProperties();
    assert.ok(typeof result.requestId);
    assert.ok(result.requestId!.length > 0);
    assert.ok(typeof result.version);
    assert.ok(result.version!.length > 0);
    assert.deepEqual(result.hourMetrics, serviceProperties.hourMetrics);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("List containers in sorted order @loki @sql", async () => {
    const containerNamePrefix = getUniqueName("container");
    const containerName1 = `${containerNamePrefix}cc`;
    const containerName2 = `${containerNamePrefix}aa`;
    const containerName3 = `${containerNamePrefix}bb`;
    const containerClient1 = serviceClient.getContainerClient(containerName1);
    const containerClient2 = serviceClient.getContainerClient(containerName2);
    const containerClient3 = serviceClient.getContainerClient(containerName3);
    await containerClient1.create();
    await containerClient2.create();
    await containerClient3.create();
    const result = (
      await serviceClient
        .listContainers({
          prefix: containerNamePrefix
        })
        .byPage()
        .next()
    ).value;
    assert.equal(result.containerItems.length, 3);
    assert.ok(result.containerItems[0].name.endsWith("aa"));
    assert.ok(result.containerItems[1].name.endsWith("bb"));
    assert.ok(result.containerItems[2].name.endsWith("cc"));
    await containerClient1.delete();
    await containerClient2.delete();
    await containerClient3.delete();
  });

  it("List containers with marker @loki @sql", async () => {
    const containerNamePrefix = getUniqueName("container");
    const containerName1 = `${containerNamePrefix}cc`;
    const containerName2 = `${containerNamePrefix}aa`;
    const containerName3 = `${containerNamePrefix}bb`;
    const containerClient1 = serviceClient.getContainerClient(containerName1);
    const containerClient2 = serviceClient.getContainerClient(containerName2);
    const containerClient3 = serviceClient.getContainerClient(containerName3);
    await containerClient1.create();
    await containerClient2.create();
    await containerClient3.create();
    const result = (
      await serviceClient
        .listContainers({
          prefix: containerNamePrefix
        })
        .byPage({ continuationToken: containerName2 })
        .next()
    ).value;
    assert.equal(result.containerItems.length, 2);
    assert.equal(result.containerItems[0].name, containerName3);
    assert.equal(result.containerItems[1].name, containerName1);
    await containerClient1.delete();
    await containerClient2.delete();
    await containerClient3.delete();
  });

  it("List containers with marker and max result length less than result size @loki @sql", async () => {
    const containerNamePrefix = getUniqueName("container");
    const containerName1 = `${containerNamePrefix}cc`;
    const containerName2 = `${containerNamePrefix}aa`;
    const containerName3 = `${containerNamePrefix}bb`;
    const containerClient1 = serviceClient.getContainerClient(containerName1);
    const containerClient2 = serviceClient.getContainerClient(containerName2);
    const containerClient3 = serviceClient.getContainerClient(containerName3);
    await containerClient1.create();
    await containerClient2.create();
    await containerClient3.create();
    const result1 = (
      await serviceClient
        .listContainers({ prefix: containerNamePrefix })
        .byPage({ continuationToken: containerName2, maxPageSize: 1 })
        .next()
    ).value;

    assert.equal(result1.containerItems.length, 1);
    assert.equal(result1.containerItems[0].name, containerName3);
    assert.equal(result1.continuationToken, containerName3);

    const result2 = (
      await serviceClient
        .listContainers({ prefix: containerNamePrefix })
        .byPage({
          continuationToken: result1.continuationToken,
          maxPageSize: 1
        })
        .next()
    ).value;
    assert.equal(result2.containerItems.length, 1);
    assert.ok(result2.containerItems[0].name, containerName1);
    assert.equal(result2.continuationToken, "");

    await containerClient1.delete();
    await containerClient2.delete();
    await containerClient3.delete();
  });

  it("ListContainers with default parameters @loki @sql", async () => {
    const result = (await serviceClient.listContainers().byPage().next()).value;
    assert.ok(typeof result.requestId);
    assert.ok(result.requestId!.length > 0);
    assert.ok(typeof result.version);
    assert.ok(result.version!.length > 0);

    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(result.containerItems!.length >= 0);

    if (result.containerItems!.length > 0) {
      const container = result.containerItems![0];
      assert.ok(container.name.length > 0);
      assert.ok(container.properties.etag.length > 0);
      assert.ok(container.properties.lastModified);
    }
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("ListContainers with all parameters configured @loki @sql", async () => {
    const containerNamePrefix = getUniqueName("container");
    const containerName1 = `${containerNamePrefix}x1`;
    const containerName2 = `${containerNamePrefix}x2`;
    const containerClient1 = serviceClient.getContainerClient(containerName1);
    const containerClient2 = serviceClient.getContainerClient(containerName2);
    await containerClient1.create({ metadata: { key: "val" } });
    await containerClient2.create({ metadata: { key: "val" } });

    const result1 = (
      await serviceClient
        .listContainers({
          includeMetadata: true,
          prefix: containerNamePrefix
        })
        .byPage({ maxPageSize: 1 })
        .next()
    ).value;

    assert.ok(result1.continuationToken);
    assert.equal(result1.containerItems!.length, 1);
    assert.ok(result1.containerItems![0].name.startsWith(containerNamePrefix));
    assert.ok(result1.containerItems![0].properties.etag.length > 0);
    assert.ok(result1.containerItems![0].properties.lastModified);
    assert.ok(!result1.containerItems![0].properties.leaseDuration);
    assert.ok(!result1.containerItems![0].properties.publicAccess);
    assert.deepEqual(
      result1.containerItems![0].properties.leaseState,
      "available"
    );
    assert.deepEqual(
      result1.containerItems![0].properties.leaseStatus,
      "unlocked"
    );
    assert.deepEqual(result1.containerItems![0].metadata!.key, "val");
    assert.equal(
      result1._response.request.headers.get("x-ms-client-request-id"),
      result1.clientRequestId
    );

    const result2 = (
      await serviceClient
        .listContainers({
          includeMetadata: true,
          prefix: containerNamePrefix
        })
        .byPage({
          continuationToken: result1.continuationToken,
          maxPageSize: 1
        })
        .next()
    ).value;

    assert.equal(result2.containerItems!.length, 1);
    assert.ok(result2.containerItems![0].name.startsWith(containerNamePrefix));
    assert.ok(result2.containerItems![0].properties.etag.length > 0);
    assert.ok(result2.containerItems![0].properties.lastModified);
    assert.ok(!result2.containerItems![0].properties.leaseDuration);
    assert.ok(!result2.containerItems![0].properties.publicAccess);
    assert.deepEqual(
      result2.containerItems![0].properties.leaseState,
      "available"
    );
    assert.deepEqual(
      result2.containerItems![0].properties.leaseStatus,
      "unlocked"
    );
    assert.deepEqual(result2.containerItems![0].metadata!.key, "val");

    await containerClient1.delete();
    await containerClient2.delete();
  });

  it("get Account info @loki @sql", async () => {
    const result = await serviceClient.getAccountInfo();
    assert.equal(result.accountKind, EMULATOR_ACCOUNT_KIND);
    assert.equal(result.skuName, EMULATOR_ACCOUNT_SKUNAME);
    assert.equal(result.isHierarchicalNamespaceEnabled, EMULATOR_ACCOUNT_ISHIERARCHICALNAMESPACEENABLED);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("Get Account/Service Properties with Uri has suffix '/' after account name @loki @sql", async () => {
    const baseURL1 = `http://${server.config.host}:${server.config.port}/devstoreaccount1/`;
    const serviceClient1 = new BlobServiceClient(
      baseURL1,
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

    let result = await serviceClient1.getAccountInfo();
    assert.equal(result.accountKind, EMULATOR_ACCOUNT_KIND);
    assert.equal(result.skuName, EMULATOR_ACCOUNT_SKUNAME);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    result = await serviceClient1.getProperties();
    assert.ok(typeof result.requestId);
    assert.ok(result.requestId!.length > 0);
    assert.ok(typeof result.version);
    assert.ok(result.version!.length > 0);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("Get Blob service stats negative @loki", async () => {
    await serviceClient.getStatistics()
      .catch((err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, "InvalidQueryParameterValue");
        assert.ok(err);
      });;
  });
});

describe("ServiceAPIs - secondary location endpoint", () => {
  const factory = new BlobTestServerFactory();
  const server = factory.createServer();

  const baseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1-secondary`;
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

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it("Get Blob service stats @loki", async () => {

    await serviceClient.getStatistics()
      .then((result) => {
        assert.strictEqual(result.geoReplication?.status, "live");
      })
      .catch((err) => {
        assert.ifError(err);
      });
  });
});
