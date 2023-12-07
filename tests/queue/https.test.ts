import {
  QueueServiceClient,
  newPipeline,
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

describe("Queue HTTPS", () => {
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

  let server: Server;

  before(async () => {
    server = new QueueTestServerFactory().createServer({
      metadataDBPath: metadataDbPath,
      extentDBPath: extentDbPath,
      persistencePathArray: DEFAULT_QUEUE_PERSISTENCE_ARRAY,
      https: true
    });
    await server.start();
  });

  after(async () => {
    await server.close();
    await rmRecursive(metadataDbPath);
    await rmRecursive(extentDbPath);
    await rmRecursive(persistencePath);
  });

  const baseURL = `https://${host}:${port}/devstoreaccount1`;

  it(`Should work with correct shared key when using HTTPS endpoint @loki`, async () => {
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

    const queueName: string = getUniqueName("queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);

    await queueClient.create();
    await queueClient.delete();
  });
});
