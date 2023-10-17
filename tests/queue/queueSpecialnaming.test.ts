import * as assert from "assert";

import {
  newPipeline,
  QueueServiceClient,
  StorageSharedKeyCredential
} from "@azure/storage-queue";

import { configLogger } from "../../src/common/Logger";
import { StoreDestinationArray } from "../../src/common/persistence/IExtentStore";
import Server from "../../src/queue/QueueServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  rmRecursive
} from "../testutils";
import QueueTestServerFactory from "./utils/QueueTestServerFactory";

// Set true to enable debug log
configLogger(false);

describe("Queue SpecialNaming", () => {
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
    });
    await server.start();
  });

  after(async () => {
    await server.close();
    await rmRecursive(metadataDbPath);
    await rmRecursive(extentDbPath);
    await rmRecursive(persistencePath);
  });

  it("A queue name must be from 3 through 63 characters long @loki", async () => {
    let queueName = new Array(65).join("a");
    let queueClient = serviceClient.getQueueClient(queueName);
    let error;
    try {
      await queueClient.create();
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(
      error.message.includes(
        "The specified resource name length is not within the permissible limits."
      )
    );

    queueName = new Array(3).join("a");
    queueClient = serviceClient.getQueueClient(queueName);
    error = undefined;
    try {
      await queueClient.create();
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(
      error.message.includes(
        "The specified resource name length is not within the permissible limits."
      )
    );

    queueName = new Array(4).join("a");
    queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();
    await queueClient.delete();

    queueName = new Array(64).join("a");
    queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();
    await queueClient.delete();
  });

  it("All letters in a queue name must be lowercase. @loki", async () => {
    let queueName = "Queue";
    let queueClient = serviceClient.getQueueClient(queueName);
    let error;
    try {
      await queueClient.create();
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(
      error.message.includes(
        "The specifed resource name contains invalid characters."
      )
    );

    queueName = "queue";
    queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();
    await queueClient.delete();
  });

  it("A queue name contains only letters, numbers, and the dash (-) character in rules @loki", async () => {
    let queueName = "-queue123";
    let queueClient = serviceClient.getQueueClient(queueName);
    let error;
    try {
      await queueClient.create();
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(
      error.message.includes(
        "The specifed resource name contains invalid characters."
      )
    );

    queueName = "queue123-";
    queueClient = serviceClient.getQueueClient(queueName);
    error = undefined;
    try {
      await queueClient.create();
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(
      error.message.includes(
        "The specifed resource name contains invalid characters."
      )
    );

    queueName = "queue-123";
    queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();
    await queueClient.delete();

    queueName = "queue--123";
    queueClient = serviceClient.getQueueClient(queueName);
    error = undefined;
    try {
      await queueClient.create();
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(
      error.message.includes(
        "The specifed resource name contains invalid characters."
      )
    );
  });
});
