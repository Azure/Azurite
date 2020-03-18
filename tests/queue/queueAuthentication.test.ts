import * as assert from "assert";

import {
  Aborter,
  AnonymousCredential,
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
  getUniqueName,
  rmRecursive
} from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Queue Authentication", () => {
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

  [{ serverType: "http" }, { serverType: "https" }].forEach(test => {
    const baseURL = `${test.serverType}://${host}:${port}/devstoreaccount1`;
    it(`Should not work without credential @loki when using ${test.serverType}`, async () => {
      const serviceURL = new ServiceURL(
        baseURL,
        StorageURL.newPipeline(new AnonymousCredential(), {
          retryOptions: { maxTries: 1 }
        })
      );

      const queueName: string = getUniqueName("queue-with-dash");
      const queueURL = QueueURL.fromServiceURL(serviceURL, queueName);

      let err;
      try {
        await queueURL.create(Aborter.none);
      } catch (error) {
        err = error;
      } finally {
        if (err === undefined) {
          try {
            await queueURL.delete(Aborter.none);
          } catch (error) {
            /* Noop */
          }
          assert.fail();
        }
      }
    });

    it(`Should not work without correct account name @loki when using ${test.serverType}`, async () => {
      const serviceURL = new ServiceURL(
        baseURL,
        StorageURL.newPipeline(
          new SharedKeyCredential("invalid", EMULATOR_ACCOUNT_KEY),
          {
            retryOptions: { maxTries: 1 }
          }
        )
      );

      const queueName: string = getUniqueName("queue-with-dash");
      const queueURL = QueueURL.fromServiceURL(serviceURL, queueName);

      let err;
      try {
        await queueURL.create(Aborter.none);
      } catch (error) {
        err = error;
      } finally {
        if (err === undefined) {
          try {
            await queueURL.delete(Aborter.none);
          } catch (error) {
            /* Noop */
          }
          assert.fail();
        }
      }
    });

    it(`Should not work without correct account key @loki when using ${test.serverType}`, async () => {
      const serviceURL = new ServiceURL(
        baseURL,
        StorageURL.newPipeline(
          new SharedKeyCredential(EMULATOR_ACCOUNT_NAME, "invalidkey"),
          {
            retryOptions: { maxTries: 1 }
          }
        )
      );

      const queueName: string = getUniqueName("queue-with-dash");
      const queueURL = QueueURL.fromServiceURL(serviceURL, queueName);

      let err;
      try {
        await queueURL.create(Aborter.none);
      } catch (error) {
        err = error;
      } finally {
        if (err === undefined) {
          try {
            await queueURL.delete(Aborter.none);
          } catch (error) {
            /* Noop */
          }
          assert.fail();
        }
      }
    });

    /**
     * Exclude this test temporary since we can't make this pass for https with t1 storage sdk.
     * Will add back while migrate tests to t2 storage sdk.
     */
    if (test.serverType != "http") {
      it(`Should work with correct shared key @loki when using ${test.serverType}`, async () => {
        const serviceURL = new ServiceURL(
          baseURL,
          StorageURL.newPipeline(
            new SharedKeyCredential(
              EMULATOR_ACCOUNT_NAME,
              EMULATOR_ACCOUNT_KEY
            ),
            {
              retryOptions: { maxTries: 1 }
            }
          )
        );

        const queueName: string = getUniqueName("queue-with-dash");
        const queueURL = QueueURL.fromServiceURL(serviceURL, queueName);

        await queueURL.create(Aborter.none);
        await queueURL.delete(Aborter.none);
      });
    }
  });
});
