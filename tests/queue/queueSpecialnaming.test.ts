import * as assert from "assert";
import dns = require("dns");

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
  getUniqueName,
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
  const baseSecondaryURL = `http://${host}:${port}/devstoreaccount1-secondary`;
  const productionStyleHostName = "devstoreaccount1.queue.localhost"; // Use hosts file to make this resolve
  const productionStyleHostNameForSecondary = "devstoreaccount1-secondary.queue.localhost";

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
        "The specified resource name contains invalid characters."
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
        "The specified resource name contains invalid characters."
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
        "The specified resource name contains invalid characters."
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
        "The specified resource name contains invalid characters."
      )
    );
  });

  it(`Should work with production style URL when ${productionStyleHostName} is resolvable`, async () => {
    let queueName = getUniqueName("queue");
    await dns.promises.lookup(productionStyleHostName).then(
      async (lookupAddress) => {
        const baseURLProductionStyle = `http://${productionStyleHostName}:${port}`;
        const serviceClientProductionStyle = new QueueServiceClient(
          baseURLProductionStyle,
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
        const queueProductionStyle = serviceClientProductionStyle.getQueueClient(
          queueName
        );
        
        const response = await queueProductionStyle.create();
        assert.deepStrictEqual(response._response.status, 201);
        await queueProductionStyle.delete();
      },
      () => {
        // Cannot perform this test. We need devstoreaccount1-secondary.blob.localhost to resolve to 127.0.0.1.
        // On Linux, this should just work,
        // On Windows, we can't spoof DNS record for specific process.
        // So we have options of running our own DNS server (overkill),
        // or editing hosts files (machine global operation; and requires running as admin).
        // So skip the test case.
        assert.ok(
          `Skipping test case - it needs ${productionStyleHostNameForSecondary} to be resolvable`
        );
      }
    );
  });

  it(`Should work with production style URL when ${productionStyleHostNameForSecondary} is resolvable`, async () => {
    let queueName = getUniqueName("queue");
    await dns.promises.lookup(productionStyleHostNameForSecondary).then(
      async (lookupAddress) => {
        const baseURLProductionStyle = `http://${productionStyleHostNameForSecondary}:${port}`;
        const serviceClientProductionStyle = new QueueServiceClient(
          baseURLProductionStyle,
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
        const queueProductionStyle = serviceClientProductionStyle.getQueueClient(
          queueName
        );
        
        const response = await queueProductionStyle.create();
        assert.deepStrictEqual(response._response.status, 201);
        await queueProductionStyle.delete();
      },
      () => {
        // Cannot perform this test. We need devstoreaccount1-secondary.blob.localhost to resolve to 127.0.0.1.
        // On Linux, this should just work,
        // On Windows, we can't spoof DNS record for specific process.
        // So we have options of running our own DNS server (overkill),
        // or editing hosts files (machine global operation; and requires running as admin).
        // So skip the test case.
        assert.ok(
          `Skipping test case - it needs ${productionStyleHostNameForSecondary} to be resolvable`
        );
      }
    );
  });

  it(`Should work with non-production secondary url when ${baseSecondaryURL} is resolvable`, async () => {
    const secondaryServiceClient = new QueueServiceClient(
      baseSecondaryURL,
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
    let queueName = getUniqueName("queue");
    const queueClientSecondary = secondaryServiceClient.getQueueClient(queueName);
    const response = await queueClientSecondary.create();
    assert.deepStrictEqual(response._response.status, 201);
    await queueClientSecondary.delete();
  });
});
