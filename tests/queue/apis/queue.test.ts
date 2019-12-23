import * as assert from "assert";

import {
  Aborter,
  QueueURL,
  ServiceURL,
  SharedKeyCredential,
  StorageURL
} from "@azure/storage-queue";

import { configLogger } from "../../../src/common/Logger";
import { StoreDestinationArray } from "../../../src/common/persistence/IExtentStore";
import QueueConfiguration from "../../../src/queue/QueueConfiguration";
import Server from "../../../src/queue/QueueServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("Queue APIs test", () => {
  // TODO: Create a server factory as tests utils
  const host = "127.0.0.1";
  const port = 11001;
  const metadataDbPath = "__queueTestsStorage__";
  const extentDbPath = "__queueExtentTestsStorage__";
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
  let queueName: string;
  let queueURL: QueueURL;

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

  beforeEach(async function() {
    queueName = getUniqueName("queue");
    queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    await queueURL.create(Aborter.none);
  });

  afterEach(async () => {
    await queueURL.delete(Aborter.none);
  });

  it("setMetadata", async () => {
    const metadata = {
      key0: "val0",
      keya: "vala",
      keyb: "valb"
    };
    const mResult = await queueURL.setMetadata(Aborter.none, metadata);
    assert.equal(
      mResult._response.request.headers.get("x-ms-client-request-id"),
      mResult.clientRequestId
    );

    const result = await queueURL.getProperties(Aborter.none);
    assert.deepEqual(result.metadata, metadata);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });

  it("getProperties with default/all parameters", async () => {
    const result = await queueURL.getProperties(Aborter.none);
    assert.ok(result.approximateMessagesCount! >= 0);
    assert.ok(result.requestId);
    assert.ok(result.version);
    assert.ok(result.date);
  });

  it("getProperties negative", async () => {
    const queueName2 = getUniqueName("queue2");
    const queueURL2 = QueueURL.fromServiceURL(serviceURL, queueName2);
    let error;
    try {
      await queueURL2.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(error.statusCode);
    assert.deepEqual(error.statusCode, 404);
    assert.ok(error.response);
    assert.ok(error.response.body);
    assert.ok(error.response.body.includes("QueueNotFound"));
  });

  it("create with default parameters", done => {
    // create() with default parameters has been tested in beforeEach
    done();
  });

  it("create with all parameters", async () => {
    const qURL = QueueURL.fromServiceURL(serviceURL, getUniqueName(queueName));
    const metadata = { key: "value" };
    await qURL.create(Aborter.none, { metadata });
    const result = await qURL.getProperties(Aborter.none);
    assert.deepEqual(result.metadata, metadata);
  });

  // create with invalid queue name
  it("create negative", async () => {
    const qURL = QueueURL.fromServiceURL(serviceURL, "");
    let error;
    try {
      await qURL.create(Aborter.none);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(error.statusCode);
    assert.deepEqual(error.statusCode, 400);
    assert.ok(error.response);
    assert.ok(error.response.body);
    assert.ok(error.response.body.includes("InvalidResourceName"));
  });

  it("delete", done => {
    // delete() with default parameters has been tested in afterEach
    done();
  });

  it("SetAccessPolicy should work", async () => {
    const queueAcl = [
      {
        accessPolicy: {
          expiry: new Date("2018-12-31T11:22:33.4567890Z"),
          permission: "raup",
          start: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      },
      {
        accessPolicy: {
          expiry: new Date("2030-11-31T11:22:33.4567890Z"),
          permission: "a",
          start: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "policy2"
      }
    ];

    const sResult = await queueURL.setAccessPolicy(Aborter.none, queueAcl);
    assert.equal(
      sResult._response.request.headers.get("x-ms-client-request-id"),
      sResult.clientRequestId
    );

    const result = await queueURL.getAccessPolicy(Aborter.none);
    assert.deepEqual(result.signedIdentifiers, queueAcl);
    assert.equal(
      result._response.request.headers.get("x-ms-client-request-id"),
      result.clientRequestId
    );
  });
  it("setAccessPolicy negative", async () => {
    const queueAcl = [
      {
        accessPolicy: {
          expiry: new Date("2018-12-31T11:22:33.4567890Z"),
          permission: "rwdl",
          start: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
      },
      {
        accessPolicy: {
          expiry: new Date("2030-11-31T11:22:33.4567890Z"),
          permission: "a",
          start: new Date("2017-12-31T11:22:33.4567890Z")
        },
        id: "policy2"
      }
    ];

    let error;
    try {
      await queueURL.setAccessPolicy(Aborter.none, queueAcl);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
  });
});
