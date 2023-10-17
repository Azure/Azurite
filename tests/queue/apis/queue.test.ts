import * as assert from "assert";

import {
  newPipeline,
  QueueServiceClient,
  QueueClient,
  StorageSharedKeyCredential
} from "@azure/storage-queue";

import { configLogger } from "../../../src/common/Logger";
import { StoreDestinationArray } from "../../../src/common/persistence/IExtentStore";
import Server from "../../../src/queue/QueueServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive
} from "../../testutils";
import QueueTestServerFactory from "../utils/QueueTestServerFactory";

// Set true to enable debug log
configLogger(false);

describe("Queue APIs test", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11001;
  const metadataDbPath = "__queueTestsStorage__";
  const extentDbPath = "__queueExtentTestsStorage__";
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
  let queueName: string;
  let queueClient: QueueClient;

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

  beforeEach(async function () {
    queueName = getUniqueName("queue");
    queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();
  });

  afterEach(async () => {
    await queueClient.delete();
  });

  it("setMetadata @loki", async () => {
    const metadata = {
      key0: "val0",
      keya: "vala",
      keyb: "valb"
    };
    const mResult = await queueClient.setMetadata(metadata);
    assert.equal(
      mResult._response.request.headers.get("x-ms-client-request-id"),
      mResult.clientRequestId
    );

    const result = await queueClient.getProperties();
    assert.deepEqual(result.metadata, metadata);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("getProperties with default/all parameters @loki", async () => {
    const result = await queueClient.getProperties();
    assert.ok(result.approximateMessagesCount! >= 0);
    assert.ok(result.requestId);
    assert.ok(result.version);
    assert.ok(result.date);
  });

  it("getProperties negative @loki", async () => {
    const queueName2 = getUniqueName("queue2");
    const queueClient2 = serviceClient.getQueueClient(queueName2);
    let error;
    try {
      await queueClient2.getProperties();
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(error.statusCode);
    assert.deepEqual(error.statusCode, 404);
    assert.ok(error.response);
    assert.ok(error.response.bodyAsText);
    assert.ok(error.response.bodyAsText.includes("QueueNotFound"));
  });

  it("create with default parameters", (done) => {
    // create() with default parameters has been tested in beforeEach
    done();
  });

  it("create with all parameters @loki", async () => {
    const qClient = serviceClient.getQueueClient(getUniqueName(queueName));
    const metadata = { key: "value" };
    await qClient.create({ metadata });
    const result = await qClient.getProperties();
    assert.deepEqual(result.metadata, metadata);
  });

  // create with invalid queue name
  it("create negative @loki", async () => {
    let error;
    try {
      const qClient = serviceClient.getQueueClient("");
      await qClient.create();
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.equal(
      error.message,
      "Unable to extract queueName with provided information.",
      "Unexpected error caught: " + error
    );
  });

  it("delete @loki", (done) => {
    // delete() with default parameters has been tested in afterEach
    done();
  });

  it("SetAccessPolicy should work @loki", async () => {
    const queueAcl = [
      {
        accessPolicy: {
          expiresOn: new Date("2018-12-31T11:22:33.4567890Z"),
          permissions: "raup",
          startsOn: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      },
      {
        accessPolicy: {
          expiresOn: new Date("2030-11-31T11:22:33.4567890Z"),
          permissions: "a",
          startsOn: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "policy2"
      },
      {
        accessPolicy: {
          permissions: "ra",
          startsOn: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "policy3"
      },
      {
        accessPolicy: {
          expiresOn: new Date("2030-11-31T11:22:33.4567890Z"),
          permissions: "up"
        },
        id: "policy4"
      }
    ];

    const sResult = await queueClient.setAccessPolicy(queueAcl);
    assert.equal(
      sResult._response.request.headers.get("x-ms-client-request-id"),
      sResult.clientRequestId
    );

    const result = await queueClient.getAccessPolicy();
    assert.deepEqual(result.signedIdentifiers, queueAcl);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });
  it("setAccessPolicy negative @loki", async () => {
    const queueAcl = [
      {
        accessPolicy: {
          expiresOn: new Date("2018-12-31T11:22:33.4567890Z"),
          permissions: "rwdl",
          startsOn: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      },
      {
        accessPolicy: {
          expiresOn: new Date("2030-11-31T11:22:33.4567890Z"),
          permissions: "a",
          startsOn: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "policy2"
      }
    ];

    let error;
    try {
      await queueClient.setAccessPolicy(queueAcl);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
  });
});
