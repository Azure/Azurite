import {
  QueueServiceClient,
  newPipeline,
  StorageSharedKeyCredential
} from "@azure/storage-queue";
import * as assert from "assert";

import { configLogger } from "../../../src/common/Logger";
import { StoreDestinationArray } from "../../../src/common/persistence/IExtentStore";
import Server from "../../../src/queue/QueueServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive,
  sleep
} from "../../testutils";
import QueueTestServerFactory from "../utils/QueueTestServerFactory";

// Set true to enable debug log
configLogger(false);

describe("QueueServiceAPIs", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11001;
  const metadataDbPath = "__queueTestsStorage__";
  const extentDbPath = "__extentTestsStorage__";
  const persistencePath = "__queueTestsPersistence__";

  const DEFAULT_QUEUE_PERSISTENCE_ARRAY: StoreDestinationArray = [
    {
      locationId: "queueTest",
      locationPath: persistencePath,
      maxConcurrency: 10
    }
  ];

  const baseURL = `http://${host}:${port}/devstoreaccount1`;
  const serviceClient = new QueueServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    )
  );

  let server: Server;

  before(async () => {
    server = new QueueTestServerFactory().createServer({
      metadataDBPath: metadataDbPath,
      extentDBPath: extentDbPath,
      persistencePathArray: DEFAULT_QUEUE_PERSISTENCE_ARRAY
    })
    await server.start();
  });

  after(async () => {
    await server.close();
    await rmRecursive(metadataDbPath);
    await rmRecursive(extentDbPath);
    await rmRecursive(persistencePath);
  });

  it("Get Queue service properties @loki", async () => {
    const result = await serviceClient.getProperties();

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

  it("Set CORS with empty AllowedHeaders, ExposedHeaders @loki", async () => {
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

  it("Set Queue service properties @loki", async () => {
    const serviceProperties = await serviceClient.getProperties();
    assert.equal(
      serviceProperties._response.request.headers.get("x-ms-client-request-id"),
      serviceProperties.clientRequestId
    );

    serviceProperties.queueAnalyticsLogging = {
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

    const sResult = await serviceClient.setProperties(serviceProperties);
    assert.equal(
      sResult._response.request.headers.get("x-ms-client-request-id"),
      sResult.clientRequestId
    );

    await sleep(1 * 1000);

    const result = await serviceClient.getProperties();
    assert.ok(typeof result.requestId);
    assert.ok(result.requestId!.length > 0);
    assert.ok(typeof result.version);
    assert.ok(result.version!.length > 0);
    assert.deepEqual(result.hourMetrics, serviceProperties.hourMetrics);
  });

  it("listQueuesSegment with default parameters @loki", async () => {
    const result = (await serviceClient.listQueues().byPage().next()).value;
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

  it("listQueuesSegment with all parameters @loki", async () => {
    const queueNamePrefix = getUniqueName("queue");
    const queueName1 = `${queueNamePrefix}x1`;
    const queueName2 = `${queueNamePrefix}x2`;
    const queueClient1 = serviceClient.getQueueClient(queueName1);
    const queueClient2 = serviceClient.getQueueClient(queueName2);
    await queueClient1.create({ metadata: { key: "val" } });
    const cResult = await queueClient2.create({
      metadata: { key: "val" }
    });
    assert.equal(
      cResult._response.request.headers.get("x-ms-client-request-id"),
      cResult.clientRequestId
    );

    const result1 = (
      await serviceClient
        .listQueues({
          includeMetadata: true,
          prefix: queueNamePrefix
        })
        .byPage({ maxPageSize: 1 })
        .next()
    ).value;

    assert.ok(result1.continuationToken);
    assert.equal(result1.queueItems!.length, 1);
    assert.ok(result1.queueItems![0].name.startsWith(queueNamePrefix));
    assert.deepEqual(result1.queueItems![0].metadata!.key, "val");

    const result2 = (
      await serviceClient
        .listQueues({
          includeMetadata: true,
          prefix: queueNamePrefix
        })
        .byPage({
          continuationToken: result1.continuationToken,
          maxPageSize: 1
        })
        .next()
    ).value;

    assert.ok(!result2.continuationToken);
    assert.equal(result2.queueItems!.length, 1);
    assert.ok(result2.queueItems![0].name.startsWith(queueNamePrefix));
    assert.deepEqual(result2.queueItems![0].metadata!.key, "val");

    await queueClient1.delete();
    const dResult = await queueClient2.delete();
    assert.equal(
      dResult._response.request.headers.get("x-ms-client-request-id"),
      dResult.clientRequestId
    );
  });

  it("Get Queue service stats negative @loki", async () => {
    await serviceClient.getStatistics()
      .catch((err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.details.code, "InvalidQueryParameterValue");
        assert.ok(err);
      });;
  });
});

describe("QueueServiceAPIs - secondary location endpoint", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11001;
  const metadataDbPath = "__queueTestsStorage__";
  const extentDbPath = "__extentTestsStorage__";
  const persistencePath = "__queueTestsPersistence__";

  const DEFAULT_QUEUE_PERSISTENCE_ARRAY: StoreDestinationArray = [
    {
      locationId: "queueTest",
      locationPath: persistencePath,
      maxConcurrency: 10
    }
  ];

  const baseURL = `http://${host}:${port}/devstoreaccount1-secondary`;
  const serviceClient = new QueueServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 }
      }
    )
  );

  let server: Server;

  before(async () => {
    server = new QueueTestServerFactory().createServer({
      metadataDBPath: metadataDbPath,
      extentDBPath: extentDbPath,
      persistencePathArray: DEFAULT_QUEUE_PERSISTENCE_ARRAY
    });
    await server.start();
  });

  after(async () => {
    await server.close();
    await rmRecursive(metadataDbPath);
    await rmRecursive(extentDbPath);
    await rmRecursive(persistencePath);
  });

  it("Get Queue service stats @loki", async () => {

    await serviceClient.getStatistics()
      .then((result) => {
        assert.strictEqual(result.geoReplication?.status, "live");
      })
      .catch((err) => {
        assert.ifError(err);
      });
  });
});
