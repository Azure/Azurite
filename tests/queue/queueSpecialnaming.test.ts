import * as assert from "assert";

import {
  Aborter,
  QueueURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-queue";

import { configLogger } from "../../src/common/Logger";
import { StoreDestinationArray } from "../../src/common/persistence/IExtentStore";
import QueueConfiguration from "../../src/queue/QueueConfiguration";
import Server from "../../src/queue/QueueServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  rmRecursive
} from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Queue SpecialNaming", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11001;
  const metadataDbPath = "__queueTestsStorage__";
  const extentDbPath = "__extentTestsStorage__";
  const persistencePath = "__queueTestsPersistence__";

  const DEFUALT_QUEUE_PERSISTENCE_ARRAY: StoreDestinationArray = [
    {
      locationId: "queueTest",
      locationPath: persistencePath,
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

  it("A queue name must be from 3 through 63 characters long @loki", async () => {
    let queueName = new Array(65).join("a");
    let queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    let error;
    try {
      await queueURL.create(Aborter.none);
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
    queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    error = undefined;
    try {
      await queueURL.create(Aborter.none);
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
    queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    await queueURL.create(Aborter.none);
    await queueURL.delete(Aborter.none);

    queueName = new Array(64).join("a");
    queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    await queueURL.create(Aborter.none);
    await queueURL.delete(Aborter.none);
  });

  it("All letters in a queue name must be lowercase. @loki", async () => {
    let queueName = "Queue";
    let queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    let error;
    try {
      await queueURL.create(Aborter.none);
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
    queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    await queueURL.create(Aborter.none);
    await queueURL.delete(Aborter.none);
  });

  it("A queue name contains only letters, numbers, and the dash (-) character in rules @loki", async () => {
    let queueName = "-queue123";
    let queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    let error;
    try {
      await queueURL.create(Aborter.none);
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
    queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    error = undefined;
    try {
      await queueURL.create(Aborter.none);
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
    queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    await queueURL.create(Aborter.none);
    await queueURL.delete(Aborter.none);

    queueName = "queue--123";
    queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    error = undefined;
    try {
      await queueURL.create(Aborter.none);
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
