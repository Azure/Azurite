import * as assert from "assert";
import * as http from "http";

import {
  AnonymousCredential,
  StorageSharedKeyCredential,
  newPipeline,
  QueueServiceClient
} from "@azure/storage-queue";

import { computeHMACSHA256 } from "../../src/common/utils/utils";
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

describe("Queue Authentication", () => {
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

  const baseURL = `http://${host}:${port}/devstoreaccount1`;

  it(`Should not work without credential @loki`, async () => {
    const serviceClient = new QueueServiceClient(
      baseURL,
      newPipeline(new AnonymousCredential(), {
        retryOptions: { maxTries: 1 }
      })
    );

    const queueName: string = getUniqueName("queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);

    let err;
    try {
      await queueClient.create();
    } catch (error) {
      err = error;
    } finally {
      if (err === undefined) {
        try {
          await queueClient.delete();
        } catch (error) {
          /* Noop */
        }
        assert.fail();
      }
    }
  });

  it(`Should not work without correct account name @loki`, async () => {
    const serviceClient = new QueueServiceClient(
      baseURL,
      newPipeline(
        new StorageSharedKeyCredential("invalid", EMULATOR_ACCOUNT_KEY),
        {
          retryOptions: { maxTries: 1 }
        }
      )
    );

    const queueName: string = getUniqueName("queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);

    let err;
    try {
      await queueClient.create();
    } catch (error) {
      err = error;
    } finally {
      if (err === undefined) {
        try {
          await queueClient.delete();
        } catch (error) {
          /* Noop */
        }
        assert.fail();
      }
    }
  });

  it(`Should not work without correct account key @loki`, async () => {
    const serviceClient = new QueueServiceClient(
      baseURL,
      newPipeline(
        new StorageSharedKeyCredential(EMULATOR_ACCOUNT_NAME, "invalidkey"),
        {
          retryOptions: { maxTries: 1 }
        }
      )
    );

    const queueName: string = getUniqueName("queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);

    let err;
    try {
      await queueClient.create();
    } catch (error) {
      err = error;
    } finally {
      if (err === undefined) {
        try {
          await queueClient.delete();
        } catch (error) {
          /* Noop */
        }
        assert.fail();
      }
    }
  });

  it(`Should work with correct shared key @loki`, async () => {
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

  // Regression test for https://github.com/Azure/Azurite/issues/1385
  // Azure Storage ignores the `Date` header when `x-ms-date` is present and
  // signs Blob/Queue SharedKey with an EMPTY Date field. Azurite must match,
  // otherwise SharedKey auth fails whenever a `Date` header is also sent.
  it(`Should authenticate SharedKey when both Date and x-ms-date headers are present @loki`, async () => {
    const account = EMULATOR_ACCOUNT_NAME;
    const key = Buffer.from(EMULATOR_ACCOUNT_KEY, "base64");
    const apiVersion = "2025-11-05";
    const dateValue = new Date().toUTCString();
    const queueName = getUniqueName("bothdatesqueue");

    // StringToSign built exactly as Azure/Azurite do for Queue SharedKey, with
    // an EMPTY Date field because x-ms-date is present. Create Queue has no
    // query parameters, so the canonicalized resource has no trailing query.
    const stringToSign =
      [
        "PUT", // VERB
        "", // Content-Language
        "", // Content-Encoding
        "", // Content-Length ("0" is normalized to "")
        "", // Content-MD5
        "", // Content-Type
        "", // Date -> empty because x-ms-date is present
        "", // If-Modified-Since
        "", // If-Match
        "", // If-None-Match
        "", // If-Unmodified-Since
        "" // Range
      ].join("\n") +
      "\n" +
      `x-ms-date:${dateValue}\nx-ms-version:${apiVersion}\n` +
      // The emulator canonicalized resource repeats the account name.
      `/${account}/${account}/${queueName}`;

    const signature = computeHMACSHA256(stringToSign, key);

    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          host,
          port,
          method: "PUT",
          path: `/${account}/${queueName}`,
          headers: {
            "x-ms-date": dateValue,
            date: dateValue, // both headers present - the #1385 repro
            "x-ms-version": apiVersion,
            "content-length": "0",
            authorization: `SharedKey ${account}:${signature}`
          }
        },
        (res) => {
          res.on("data", () => {
            /* drain */
          });
          res.on("end", () => resolve(res.statusCode || 0));
        }
      );
      req.on("error", reject);
      req.end();
    });

    assert.strictEqual(
      statusCode,
      201,
      `Expected queue create to succeed (201) with both Date and x-ms-date headers, got ${statusCode}`
    );

    // Best-effort cleanup to keep per-test state isolated.
    try {
      const cleanupClient = new QueueServiceClient(
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
      await cleanupClient.getQueueClient(queueName).delete();
    } catch (error) {
      /* Noop */
    }
  });
});
