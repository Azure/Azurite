import {
  StorageSharedKeyCredential,
  newPipeline,
  QueueServiceClient
} from "@azure/storage-queue";
import * as assert from "assert";

import { configLogger } from "../../src/common/Logger";
import { StoreDestinationArray } from "../../src/common/persistence/IExtentStore";
import Server from "../../src/queue/QueueServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  rmRecursive,
} from "../testutils";
import QueueTestServerFactory from "./utils/QueueTestServerFactory";
import { DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT } from "../../src/queue/utils/constants";

// Set true to enable debug log
configLogger(false);

describe("Queue Keep-Alive header response test", () => {
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
  const queueServiceClient = new QueueServiceClient(
    baseURL,
    newPipeline(
      new StorageSharedKeyCredential(
        EMULATOR_ACCOUNT_NAME,
        EMULATOR_ACCOUNT_KEY
      ),
      {
        retryOptions: { maxTries: 1 },
        keepAliveOptions: { enable: true }
      }
    )
  );

  let server: Server;
  before(async () => {
    server = new QueueTestServerFactory().createServer({
      metadataDBPath: metadataDbPath,
      extentDBPath: metadataDbPath,
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

  it("request with enabled keep-alive shall return DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT", async () => {
    const properties = await queueServiceClient.getProperties();
    const keepAliveHeader = properties._response.headers.get("keep-alive");
    if (keepAliveHeader !== undefined) {
      assert.strictEqual(keepAliveHeader, "timeout=" + DEFAULT_QUEUE_KEEP_ALIVE_TIMEOUT);
    }
  });

});
