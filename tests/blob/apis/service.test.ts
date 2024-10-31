import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  BlobServiceClient,
  generateAccountSASQueryParameters,
  newPipeline,
  SASProtocol,
  StorageSharedKeyCredential,
  Tags
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

  // fix issue 2382, 2416
  it("ListContainers without include metadata should not return container metadata. @loki @sql", async () => {
    const containerNamePrefix = getUniqueName("container");
    const containerName1 = `${containerNamePrefix}x1`;
    const containerName2 = `${containerNamePrefix}x2`;
    const containerClient1 = serviceClient.getContainerClient(containerName1);
    const containerClient2 = serviceClient.getContainerClient(containerName2);
    await containerClient1.create({ metadata: { key: "val" } });
    await containerClient2.create({ metadata: { key: "val" } });

    // list containers without include metadata will not return metadata
    const result1 = (
      await serviceClient
        .listContainers({
          prefix: containerNamePrefix
        })
        .byPage()
        .next()
    ).value;

    assert.equal(result1.containerItems!.length, 2);
    assert.ok(result1.containerItems![0].name.startsWith(containerNamePrefix));
    assert.ok(result1.containerItems![1].name.startsWith(containerNamePrefix));
    assert.equal(result1.containerItems![0].metadata, undefined);
    assert.equal(result1.containerItems![1].metadata, undefined);

    // then list containers with include metadata will return metadata
    const result2 = (
      await serviceClient
        .listContainers({
          includeMetadata: true,
          prefix: containerNamePrefix
        })
        .byPage()
        .next()
    ).value;

    assert.equal(result2.containerItems!.length, 2);
    assert.ok(result2.containerItems![0].name.startsWith(containerNamePrefix));
    assert.ok(result2.containerItems![1].name.startsWith(containerNamePrefix));
    assert.deepEqual(result2.containerItems![0].metadata!.key, "val");
    assert.deepEqual(result2.containerItems![1].metadata!.key, "val");
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

  it("Get Account/Service Properties with URI has suffix '/' after account name @loki @sql", async () => {
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

  it("Find blob by tags should work @loki @sql", async function () {
    const containerName = getUniqueName("container1");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const key1 = getUniqueName("key");
    const key2 = getUniqueName("key2");

    const blobName1 = getUniqueName("blobname1");
    const appendBlobClient1 = containerClient.getAppendBlobClient(blobName1);
    const tags1: Tags = {};
    tags1[key1] = getUniqueName("val1");
    tags1[key2] = "default";
    await appendBlobClient1.create({ tags: tags1 });

    const blobName2 = getUniqueName("blobname2");
    const appendBlobClient2 = containerClient.getAppendBlobClient(blobName2);
    const tags2: Tags = {};
    tags2[key1] = getUniqueName("val2");
    tags2[key2] = "default";
    await appendBlobClient2.create({ tags: tags2 });

    const blobName3 = getUniqueName("blobname3");
    const appendBlobClient3 = containerClient.getAppendBlobClient(blobName3);
    const tags3: Tags = {};
    tags3[key1] = getUniqueName("val3");
    tags3[key2] = "default";
    await appendBlobClient3.create({ tags: tags3 });

    const expectedTags1: Tags = {};
    expectedTags1[key1] = tags1[key1];
    for await (const blob of serviceClient.findBlobsByTags(`${key1}='${tags1[key1]}'`)) {
      assert.deepStrictEqual(blob.containerName, containerName);
      assert.deepStrictEqual(blob.name, blobName1);
      assert.deepStrictEqual(blob.tags, expectedTags1);
      assert.deepStrictEqual(blob.tagValue, tags1[key1]);
    }

    const expectedTags2: Tags = {};
    expectedTags2[key1] = tags2[key1];
    const blobs = [];
    for await (const blob of serviceClient.findBlobsByTags(`${key1}='${tags2[key1]}'`)) {
      blobs.push(blob);
    }
    assert.deepStrictEqual(blobs.length, 1);
    assert.deepStrictEqual(blobs[0].containerName, containerName);
    assert.deepStrictEqual(blobs[0].name, blobName2);
    assert.deepStrictEqual(blobs[0].tags, expectedTags2);
    assert.deepStrictEqual(blobs[0].tagValue, tags2[key1]);

    const blobsWithTag2 = [];
    for await (const segment of serviceClient.findBlobsByTags(`${key2}='default'`).byPage({
      maxPageSize: 1,
    })) {
      assert.ok(segment.blobs.length <= 1);
      for (const blob of segment.blobs) {
        blobsWithTag2.push(blob);
      }
    }
    assert.deepStrictEqual(blobsWithTag2.length, 3);

    for await (const blob of serviceClient.findBlobsByTags(
      `@container='${containerName}' AND ${key1}='${tags1[key1]}' AND ${key2}='default'`,
    )) {
      assert.deepStrictEqual(blob.containerName, containerName);
      assert.deepStrictEqual(blob.name, blobName1);
      assert.deepStrictEqual(blob.tags, tags1);
      assert.deepStrictEqual(blob.tagValue, "");
    }

    await containerClient.delete();
  });

  it("filter blob by tags with more than limited conditions on service @loki @sql", async function () {
    const containerName = getUniqueName("container1");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const tags: Tags = {};
    const tagsLength = 10;

    let queryString = '';
    for (let i = 0; i < tagsLength; ++i) {
      const key = getUniqueName("key" + i);
      const value = getUniqueName("val" + i);
      tags[key] = value;
      queryString += `${key}='${value}' and `;
    }

    queryString += `anotherkey='anotherValue'`;

    const blobName1 = getUniqueName("blobname1");
    const appendBlobClient1 = containerClient.getAppendBlobClient(blobName1);
    await appendBlobClient1.create({ tags: tags });

    await appendBlobClient1.createSnapshot();

    try {
      (await serviceClient.findBlobsByTags(queryString).byPage().next()).value;
      assert.fail("Should not reach here");
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidQueryParameterValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidQueryParameterValue');
      assert.ok((err as any).details.message.startsWith('Error parsing query: there can be at most 10 unique tags in a query'));
    }

    await containerClient.delete();
  });

  it("filter blob by tags with conditions number equal to limitation on service @loki @sql", async function () {
    const containerName = getUniqueName("container1");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const tags: Tags = {};
    const tagsLength = 10;

    let queryString = '';
    for (let i = 0; i < tagsLength; ++i) {
      const key = getUniqueName("key" + i);
      const value = getUniqueName("val" + i);
      tags[key] = value;
      queryString += `${key}='${value}' and `;
    }

    // key @container isn't count in limitation
    queryString += `@container='${containerName}'`;

    const blobName1 = getUniqueName("blobname1");
    const appendBlobClient1 = containerClient.getAppendBlobClient(blobName1);
    await appendBlobClient1.create({ tags: tags });

    await appendBlobClient1.createSnapshot();

    let blobCountCount = 0;
    for await (const blob of serviceClient.findBlobsByTags(queryString)) {
      ++blobCountCount;
      assert.deepStrictEqual(blob.containerName, containerName);
      assert.deepStrictEqual(blob.name, blobName1);
      assert.deepStrictEqual(blob.tags, tags);
    }
    assert.deepStrictEqual(blobCountCount, 1, "Blob with snapshot should not be returned.");

    await containerClient.delete();
  });

  it("filter blob by tags with invalid key chars on service @loki @sql", async function () {
    let queryString = `key1='valffffff' and @container11='1111'`;

    try {
      (await serviceClient.findBlobsByTags(queryString).byPage().next()).value;
      assert.fail('Should not reach here');
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidQueryParameterValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidQueryParameterValue');
      assert.ok((err as any).details.message.startsWith('Error parsing query at or near character position')
        && (err as any).details.message.includes('unsupported parameter'));
    }

    queryString = `'key 1'='valffffff'`;

    try {
      (await serviceClient.findBlobsByTags(queryString).byPage().next()).value;
      assert.fail('Should not reach here');
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidQueryParameterValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidQueryParameterValue');
      assert.ok((err as any).details.message.startsWith('Error parsing query at or near character position'));
    }

    queryString = `'key-1'='valffffff'`;

    try {
      (await serviceClient.findBlobsByTags(queryString).byPage().next()).value;
      assert.fail('Should not reach here');
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidQueryParameterValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidQueryParameterValue');
      assert.ok((err as any).details.message.startsWith('Error parsing query at or near character position'));
    }
  });

  it("filter blob by tags with valid special key chars on service @loki @sql", async function () {
    const containerName = getUniqueName("container1");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const tags: Tags = {
      key_1: 'value_1'
    };
    const queryString = `key_1='value_1'`;

    const blobName1 = getUniqueName("blobname1");
    const appendBlobClient1 = containerClient.getAppendBlobClient(blobName1);
    await appendBlobClient1.create({ tags: tags });

    await appendBlobClient1.createSnapshot();

    let blobCountCount = 0;
    for await (const blob of serviceClient.findBlobsByTags(queryString)) {
      ++blobCountCount;
      assert.deepStrictEqual(blob.containerName, containerName);
      assert.deepStrictEqual(blob.name, blobName1);
      assert.deepStrictEqual(blob.tags, tags);
    }
    assert.deepStrictEqual(blobCountCount, 1, "Blob with snapshot should not be returned.");

    await containerClient.delete();
  });

  it("filter blob by tags with long key @loki @sql", async function () {
    const queryString = `key12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890='value'`;
    try {
      (await serviceClient.findBlobsByTags(queryString).byPage().next()).value;
      assert.fail('Should not reach here');
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidQueryParameterValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidQueryParameterValue');
      assert.ok((err as any).details.message.startsWith('Error parsing query at or near character position')
        && (err as any).details.message.includes('tag must be between 1 and 128 characters in length'));
    }
  });

  it("filter blob by tags with invalid value chars on service @loki @sql", async function () {
    const queryString = `key1='valffffff @'`;

    try {
      (await serviceClient.findBlobsByTags(queryString).byPage().next()).value;
      assert.fail('Should not reach here');
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidQueryParameterValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidQueryParameterValue');
      assert.ok((err as any).details.message.startsWith('Error parsing query at or near character position')
        && (err as any).details.message.includes('not permitted in tag name or value'));
    }
  });

  it("filter blob by tags with valid special value chars on service @loki @sql", async function () {
    const containerName = getUniqueName("container1");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const tags: Tags = {
      key_1: 'value +-.:=_/'
    };
    const queryString = `key_1='value +-.:=_/' and @container='${containerName}'`;

    const blobName1 = getUniqueName("blobname1");
    const appendBlobClient1 = containerClient.getAppendBlobClient(blobName1);
    await appendBlobClient1.create({ tags: tags });

    await appendBlobClient1.createSnapshot();

    let blobCountCount = 0;
    for await (const blob of serviceClient.findBlobsByTags(queryString)) {
      ++blobCountCount;
      assert.deepStrictEqual(blob.containerName, containerName);
      assert.deepStrictEqual(blob.name, blobName1);
      assert.deepStrictEqual(blob.tags, tags);
    }
    assert.deepStrictEqual(blobCountCount, 1, "Blob with snapshot should not be returned.");

    await containerClient.delete();
  });

  it("filter blob by tags with long value @loki @sql", async function () {
    const queryString = `key_1='value12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890'`;
    try {
      (await serviceClient.findBlobsByTags(queryString).byPage().next()).value;
      assert.fail('Should not reach here');
    }
    catch (err) {
      assert.deepStrictEqual((err as any).statusCode, 400);
      assert.deepStrictEqual((err as any).code, 'InvalidQueryParameterValue');
      assert.deepStrictEqual((err as any).details.errorCode, 'InvalidQueryParameterValue');
      assert.ok((err as any).details.message.startsWith('Error parsing query at or near character position')
        && (err as any).details.message.includes('tag value must be between 0 and 256 characters in length'));
    }
  });

  it("filter blob by tags with continuationToken on service @loki @sql", async function () {
    const containerName = getUniqueName("container1");
    const containerClient = serviceClient.getContainerClient(containerName);
    await containerClient.create();

    const tags: Tags = {
      key_1: 'value_1'
    };
    const queryString = `key_1='value_1'`;

    for (let index = 0; index < 5002; ++index) {
      const blobName1 = getUniqueName("blobname" + index);
      const appendBlobClient1 = containerClient.getAppendBlobClient(blobName1);
      await appendBlobClient1.create({ tags: tags });
    }

    let result = (await serviceClient.findBlobsByTags(queryString).byPage().next()).value;
    assert.ok(result.continuationToken !== undefined);

    await containerClient.delete();
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
