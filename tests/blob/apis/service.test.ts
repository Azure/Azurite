import {
  Aborter,
  ContainerURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-blob";
import * as assert from "assert";

import {
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
  const serviceURL = new ServiceURL(
    baseURL,
    StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
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

  it("GetServiceProperties", async () => {
    const result = await serviceURL.getProperties(Aborter.none);

    assert.ok(typeof result.requestId);
    assert.ok(result.requestId!.length > 0);
    assert.ok(typeof result.version);
    assert.ok(result.version!.length > 0);

    if (result.cors && result.cors!.length > 0) {
      assert.ok(result.cors![0].allowedHeaders.length > 0);
      assert.ok(result.cors![0].allowedMethods.length > 0);
      assert.ok(result.cors![0].allowedOrigins.length > 0);
      assert.ok(result.cors![0].exposedHeaders.length > 0);
      assert.ok(result.cors![0].maxAgeInSeconds >= 0);
    }
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("SetServiceProperties", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);

    serviceProperties.logging = {
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

    const result_set = await serviceURL.setProperties(
      Aborter.none,
      serviceProperties
    );
    assert.equal(
      result_set._response.request.headers.get("x-ms-client-request-id"),
      result_set.clientRequestId
    );

    const result = await serviceURL.getProperties(Aborter.none);
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

  it("List containers in sorted order", async () => {
    const containerNamePostfix = getUniqueName("container");
    const containerName1 = `cc${containerNamePostfix}`;
    const containerName2 = `aa${containerNamePostfix}`;
    const containerName3 = `bb${containerNamePostfix}`;
    const containerURL1 = ContainerURL.fromServiceURL(
      serviceURL,
      containerName1
    );
    const containerURL2 = ContainerURL.fromServiceURL(
      serviceURL,
      containerName2
    );
    const containerURL3 = ContainerURL.fromServiceURL(
      serviceURL,
      containerName3
    );
    await containerURL1.create(Aborter.none);
    await containerURL2.create(Aborter.none);
    await containerURL3.create(Aborter.none);
    const result = await serviceURL.listContainersSegment(
      Aborter.none,
      undefined
    );
    assert.equal(result.containerItems.length, 3);
    assert.ok(result.containerItems[0].name.startsWith("aa"));
    assert.ok(result.containerItems[1].name.startsWith("bb"));
    assert.ok(result.containerItems[2].name.startsWith("cc"));
    await containerURL1.delete(Aborter.none);
    await containerURL2.delete(Aborter.none);
    await containerURL3.delete(Aborter.none);
  });

  it("List containers with marker", async () => {
    const containerNamePostfix = getUniqueName("container");
    const containerName1 = `cc${containerNamePostfix}`;
    const containerName2 = `aa${containerNamePostfix}`;
    const containerName3 = `bb${containerNamePostfix}`;
    const containerURL1 = ContainerURL.fromServiceURL(
      serviceURL,
      containerName1
    );
    const containerURL2 = ContainerURL.fromServiceURL(
      serviceURL,
      containerName2
    );
    const containerURL3 = ContainerURL.fromServiceURL(
      serviceURL,
      containerName3
    );
    await containerURL1.create(Aborter.none);
    await containerURL2.create(Aborter.none);
    await containerURL3.create(Aborter.none);
    const result = await serviceURL.listContainersSegment(
      Aborter.none,
      containerName2
    );
    assert.equal(result.containerItems.length, 2);
    assert.ok(result.containerItems[0].name.startsWith("bb"));
    assert.ok(result.containerItems[1].name.startsWith("cc"));
    await containerURL1.delete(Aborter.none);
    await containerURL2.delete(Aborter.none);
    await containerURL3.delete(Aborter.none);
  });

  it("List containers with marker and max result length less than result size", async () => {
    const containerNamePostfix = getUniqueName("container");
    const containerName1 = `cc${containerNamePostfix}`;
    const containerName2 = `aa${containerNamePostfix}`;
    const containerName3 = `bb${containerNamePostfix}`;
    const containerURL1 = ContainerURL.fromServiceURL(
      serviceURL,
      containerName1
    );
    const containerURL2 = ContainerURL.fromServiceURL(
      serviceURL,
      containerName2
    );
    const containerURL3 = ContainerURL.fromServiceURL(
      serviceURL,
      containerName3
    );
    await containerURL1.create(Aborter.none);
    await containerURL2.create(Aborter.none);
    await containerURL3.create(Aborter.none);
    const result1 = await serviceURL.listContainersSegment(
      Aborter.none,
      containerName2,
      { maxresults: 1 }
    );

    assert.equal(result1.containerItems.length, 1);
    assert.ok(result1.containerItems[0].name.startsWith("bb"));
    assert.equal(result1.nextMarker, containerName3);

    const result2 = await serviceURL.listContainersSegment(
      Aborter.none,
      result1.nextMarker,
      { maxresults: 1 }
    );
    assert.equal(result2.containerItems.length, 1);
    assert.ok(result2.containerItems[0].name.startsWith("cc"));
    assert.equal(result2.nextMarker, "");

    await containerURL1.delete(Aborter.none);
    await containerURL2.delete(Aborter.none);
    await containerURL3.delete(Aborter.none);
  });

  it("ListContainers with default parameters", async () => {
    const result = await serviceURL.listContainersSegment(Aborter.none);
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

  it("ListContainers with all parameters configured", async () => {
    const containerNamePrefix = getUniqueName("container");
    const containerName1 = `${containerNamePrefix}x1`;
    const containerName2 = `${containerNamePrefix}x2`;
    const containerURL1 = ContainerURL.fromServiceURL(
      serviceURL,
      containerName1
    );
    const containerURL2 = ContainerURL.fromServiceURL(
      serviceURL,
      containerName2
    );
    await containerURL1.create(Aborter.none, { metadata: { key: "val" } });
    await containerURL2.create(Aborter.none, { metadata: { key: "val" } });

    const result1 = await serviceURL.listContainersSegment(
      Aborter.none,
      undefined,
      {
        include: "metadata",
        maxresults: 1,
        prefix: containerNamePrefix
      }
    );

    assert.ok(result1.nextMarker);
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

    const result2 = await serviceURL.listContainersSegment(
      Aborter.none,
      result1.nextMarker,
      {
        include: "metadata",
        maxresults: 1,
        prefix: containerNamePrefix
      }
    );

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

    await containerURL1.delete(Aborter.none);
    await containerURL2.delete(Aborter.none);
  });

  it("get Account info", async () => {
    const result = await serviceURL.getAccountInfo(Aborter.none);
    assert.equal(result.accountKind, EMULATOR_ACCOUNT_KIND);
    assert.equal(result.skuName, EMULATOR_ACCOUNT_SKUNAME);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });
});
