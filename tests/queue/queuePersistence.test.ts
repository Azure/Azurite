import * as assert from "assert";

import {
  newPipeline,
  QueueServiceClient,
  StorageSharedKeyCredential
} from "@azure/storage-queue";

import { configLogger } from "../../src/common/Logger";
import { StoreDestinationArray } from "../../src/common/persistence/IExtentStore";
import QueueConfiguration from "../../src/queue/QueueConfiguration";
import QueueServer from "../../src/queue/QueueServer";
import { DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT } from "../../src/queue/utils/constants";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive
} from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Queue persistence across server restarts @loki", () => {
  const host = "127.0.0.1";
  const port = 11002;
  const metadataDbPath = "__queuePersistenceTestsStorage__";
  const extentDbPath = "__queuePersistenceExtentTestsStorage__";
  const persistencePath = "__queuePersistenceTestsPersistence__";

  const persistencePathArray: StoreDestinationArray = [
    {
      locationId: "queuePersistenceTest",
      locationPath: persistencePath,
      maxConcurrency: 10
    }
  ];

  const baseURL = `http://${host}:${port}/devstoreaccount1`;

  function createServiceClient(): QueueServiceClient {
    return new QueueServiceClient(
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
  }

  function createServer(): QueueServer {
    // Explicitly disable in-memory persistence so this test always exercises
    // the on-disk LokiJS persistence layer, regardless of the
    // AZURITE_TEST_INMEMORYPERSISTENCE environment variable used by other
    // suites for speed.
    const config = new QueueConfiguration(
      host,
      port,
      DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT,
      metadataDbPath,
      extentDbPath,
      persistencePathArray,
      false,
      undefined,
      false,
      undefined,
      false,
      false,
      "",
      "",
      "",
      undefined,
      false,
      false
    );
    return new QueueServer(config);
  }

  afterEach(async () => {
    await rmRecursive(metadataDbPath);
    await rmRecursive(extentDbPath);
    await rmRecursive(persistencePath);
  });

  it("should persist queues, metadata and access policies after the server is restarted", async () => {
    const queueName = getUniqueName("queue");
    const queueAcl = [
      {
        accessPolicy: {
          expiresOn: new Date("2030-11-31T11:22:33.4567890Z"),
          permissions: "raup",
          startsOn: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "persistedpolicy"
      }
    ];

    // 1. Start a server backed by disk persistence, create a queue with
    // metadata and an access policy, then shut the server down gracefully.
    let server = createServer();
    await server.start();
    try {
      const serviceClient = createServiceClient();
      const queueClient = serviceClient.getQueueClient(queueName);
      await queueClient.create({ metadata: { key: "value" } });
      await queueClient.setAccessPolicy(queueAcl);
    } finally {
      await server.close();
    }

    // 2. Start a brand new server instance pointing at the same metadata
    // and extent DB paths, simulating an application restart / container
    // recreation, and verify the previously created queue, its metadata
    // and its access policy are all still present.
    server = createServer();
    await server.start();
    try {
      const serviceClient = createServiceClient();
      const queueClient = serviceClient.getQueueClient(queueName);

      const properties = await queueClient.getProperties();
      assert.deepStrictEqual(properties.metadata, { key: "value" });

      const policyResult = await queueClient.getAccessPolicy();
      assert.deepStrictEqual(policyResult.signedIdentifiers, queueAcl);
    } finally {
      await server.close();
    }
  });
});
