import * as assert from "assert";

import {
  Aborter,
  QueueURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-queue";

import { configLogger } from "../../../src/common/Logger";
import { StoreDestinationArray } from "../../../src/common/persistence/IExtentStore";
import QueueConfiguration from "../../../src/queue/QueueConfiguration";
import Server from "../../../src/queue/QueueServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive,
  sleep
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("QueueServiceAPIs", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11001;
  const metadataDbPath = "__queueTestsStorage__";
  const extentDbPath = "__extentTestsStorage__";
  const persistencePath = "__queueTestsPersistence__";

  const DEFUALT_QUEUE_PERSISTENCE_ARRAY: StoreDestinationArray = [
    {
      persistencyId: "queueTest",
      persistencyPath: persistencePath,
      maxConcurrency: 10
    }
  ];

  const config = new QueueConfiguration(
    host,
    port,
    metadataDbPath,
    extentDbPath,
    DEFUALT_QUEUE_PERSISTENCE_ARRAY,
    false
  );

  const baseURL = `http://${host}:${port}/devstoreaccount1`;
  const serviceURL = new ServiceURL(
    baseURL,
    StorageURL.newPipeline(
      new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY),
      {
        retryOptions: { maxTries: 1 }
      }
    )
  );

  let server: Server;

  before(async () => {
    server = new Server(config);
    await server.start();
  });

  after(async () => {
    await server.close();
    await rmRecursive(metadataDbPath);
    await rmRecursive(extentDbPath);
    await rmRecursive(persistencePath);
  });

  it("Get Queue service properties", async () => {
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
  });

  it("Set Queue service properties", async () => {
    const serviceProperties = await serviceURL.getProperties(Aborter.none);
    assert.equal(
      serviceProperties._response.request.headers.get("x-ms-client-request-id"),
      serviceProperties.clientRequestId
    );

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

    const sResult = await serviceURL.setProperties(
      Aborter.none,
      serviceProperties
    );
    assert.equal(
      sResult._response.request.headers.get("x-ms-client-request-id"),
      sResult.clientRequestId
    );

    await sleep(1 * 1000);

    const result = await serviceURL.getProperties(Aborter.none);
    assert.ok(typeof result.requestId);
    assert.ok(result.requestId!.length > 0);
    assert.ok(typeof result.version);
    assert.ok(result.version!.length > 0);
    assert.deepEqual(result.hourMetrics, serviceProperties.hourMetrics);
  });

  it("listQueuesSegment with default parameters", async () => {
    const result = await serviceURL.listQueuesSegment(Aborter.none);
    assert.ok(typeof result.requestId);
    assert.ok(result.requestId!.length > 0);
    assert.ok(typeof result.version);
    assert.ok(result.version!.length > 0);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );

    assert.ok(result.serviceEndpoint.length > 0);
    assert.ok(result.queueItems!.length >= 0);

    if (result.queueItems!.length > 0) {
      const queue = result.queueItems![0];
      assert.ok(queue.name.length > 0);
    }
  });

  it("listQueuesSegment with all parameters", async () => {
    const queueNamePrefix = getUniqueName("queue");
    const queueName1 = `${queueNamePrefix}x1`;
    const queueName2 = `${queueNamePrefix}x2`;
    const queueURL1 = QueueURL.fromServiceURL(serviceURL, queueName1);
    const queueURL2 = QueueURL.fromServiceURL(serviceURL, queueName2);
    await queueURL1.create(Aborter.none, { metadata: { key: "val" } });
    const cResult = await queueURL2.create(Aborter.none, {
      metadata: { key: "val" }
    });
    assert.equal(
      cResult._response.request.headers.get("x-ms-client-request-id"),
      cResult.clientRequestId
    );

    const result1 = await serviceURL.listQueuesSegment(
      Aborter.none,
      undefined,
      {
        include: "metadata",
        maxresults: 1,
        prefix: queueNamePrefix
      }
    );

    assert.ok(result1.nextMarker);
    assert.equal(result1.queueItems!.length, 1);
    assert.ok(result1.queueItems![0].name.startsWith(queueNamePrefix));
    assert.deepEqual(result1.queueItems![0].metadata!.key, "val");

    const result2 = await serviceURL.listQueuesSegment(
      Aborter.none,
      result1.nextMarker,
      {
        include: "metadata",
        maxresults: 1,
        prefix: queueNamePrefix
      }
    );

    assert.ok(!result2.nextMarker);
    assert.equal(result2.queueItems!.length, 1);
    assert.ok(result2.queueItems![0].name.startsWith(queueNamePrefix));
    assert.deepEqual(result2.queueItems![0].metadata!.key, "val");

    await queueURL1.delete(Aborter.none);
    const dResult = await queueURL2.delete(Aborter.none);
    assert.equal(
      dResult._response.request.headers.get("x-ms-client-request-id"),
      dResult.clientRequestId
    );
  });
});
