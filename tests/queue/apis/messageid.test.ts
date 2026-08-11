import * as assert from "assert";

import {
  QueueServiceClient,
  newPipeline,
  StorageSharedKeyCredential,
  QueueClient
} from "@azure/storage-queue";

import { configLogger } from "../../../src/common/Logger";
import { StoreDestinationArray } from "../../../src/common/persistence/IExtentStore";
import Server from "../../../src/queue/QueueServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive,
  sleep
} from "../../testutils";
import QueueTestServerFactory from "../utils/QueueTestServerFactory";

// Set true to enable debug log
configLogger(false);

describe("MessageId APIs test", () => {
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

  let queueName: string;
  let queueClient: QueueClient;
  const messageContent = "Hello World";

  before(async () => {
    server = new QueueTestServerFactory().createServer({
      metadataDBPath: metadataDbPath,
      extentDBPath: extentDbPath,
      persistencePathArray: DEFAULT_QUEUE_PERSISTENCE_ARRAY,
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

  it("update and delete empty message with default parameters @loki", async () => {
    const eResult = await queueClient.sendMessage(messageContent);
    assert.ok(eResult.date);
    assert.ok(eResult.expiresOn);
    assert.ok(eResult.insertedOn);
    assert.ok(eResult.messageId);
    assert.ok(eResult.popReceipt);
    assert.ok(eResult.requestId);
    assert.ok(eResult.nextVisibleOn);
    assert.ok(eResult.version);
    assert.equal(
      eResult._response.request.headers.get("x-ms-client-request-id"),
      eResult.clientRequestId
    );

    let newMessage = "";
    const uResult = await queueClient.updateMessage(
      eResult.messageId,
      eResult.popReceipt,
      newMessage,
      0
    );
    assert.ok(uResult.version);
    assert.ok(uResult.nextVisibleOn);
    assert.ok(uResult.date);
    assert.ok(uResult.requestId);
    assert.ok(uResult.popReceipt);
    assert.equal(
      uResult._response.request.headers.get("x-ms-client-request-id"),
      uResult.clientRequestId
    );

    let pResult = await queueClient.peekMessages();
    assert.equal(pResult.peekedMessageItems.length, 1);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageText,
      newMessage
    );
    assert.equal(
      pResult._response.request.headers.get("x-ms-client-request-id"),
      pResult.clientRequestId
    );

    const dResult = await queueClient.deleteMessage(
      eResult.messageId,
      uResult.popReceipt!
    );
    assert.ok(dResult.date);
    assert.ok(dResult.requestId);
    assert.ok(dResult.version);
    assert.equal(
      dResult._response.request.headers.get("x-ms-client-request-id"),
      dResult.clientRequestId
    );

    pResult = await queueClient.peekMessages();
    assert.equal(pResult.peekedMessageItems.length, 0);
  });

  it("update and delete message with all parameters @loki", async () => {
    const eResult = await queueClient.sendMessage(messageContent);
    assert.ok(eResult.date);
    assert.ok(eResult.expiresOn);
    assert.ok(eResult.insertedOn);
    assert.ok(eResult.messageId);
    assert.ok(eResult.popReceipt);
    assert.ok(eResult.requestId);
    assert.ok(eResult.nextVisibleOn);
    assert.ok(eResult.version);
    assert.equal(
      eResult._response.request.headers.get("x-ms-client-request-id"),
      eResult.clientRequestId
    );

    let newMessage = "New Message";
    const uResult = await queueClient.updateMessage(
      eResult.messageId,
      eResult.popReceipt,
      newMessage,
      2
    );
    assert.ok(uResult.version);
    assert.ok(uResult.nextVisibleOn);
    assert.ok(uResult.date);
    assert.ok(uResult.requestId);
    assert.ok(uResult.popReceipt);
    assert.equal(
      uResult._response.request.headers.get("x-ms-client-request-id"),
      uResult.clientRequestId
    );

    let pResult = await queueClient.peekMessages();
    assert.equal(pResult.peekedMessageItems.length, 0);
    assert.equal(
      pResult._response.request.headers.get("x-ms-client-request-id"),
      pResult.clientRequestId
    );

    await sleep(3 * 1000);

    let pResult2 = await queueClient.peekMessages();
    assert.equal(pResult2.peekedMessageItems.length, 1);
    assert.deepStrictEqual(
      pResult2.peekedMessageItems[0].messageText,
      newMessage
    );
  });

  it("update message with 64KB characters size which is computed after encoding @loki", async () => {
    const eResult = await queueClient.sendMessage(messageContent);
    assert.ok(eResult.date);
    assert.ok(eResult.expiresOn);
    assert.ok(eResult.insertedOn);
    assert.ok(eResult.messageId);
    assert.ok(eResult.popReceipt);
    assert.ok(eResult.requestId);
    assert.ok(eResult.nextVisibleOn);
    assert.ok(eResult.version);
    assert.equal(
      eResult._response.request.headers.get("x-ms-client-request-id"),
      eResult.clientRequestId
    );

    let newMessage = new Array(64 * 1024 + 1).join("a");
    const uResult = await queueClient.updateMessage(
      eResult.messageId,
      eResult.popReceipt,
      newMessage,
      0
    );
    assert.ok(uResult.version);
    assert.ok(uResult.nextVisibleOn);
    assert.ok(uResult.date);
    assert.ok(uResult.requestId);
    assert.ok(uResult.popReceipt);
    assert.equal(
      uResult._response.request.headers.get("x-ms-client-request-id"),
      uResult.clientRequestId
    );

    let pResult = await queueClient.peekMessages();
    assert.equal(pResult.peekedMessageItems.length, 1);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageText,
      newMessage
    );
    assert.equal(
      pResult._response.request.headers.get("x-ms-client-request-id"),
      pResult.clientRequestId
    );
  });

  it("update message negative with 65537B (64KB+1B) characters size which is computed after encoding @loki", async () => {
    const eResult = await queueClient.sendMessage(messageContent);
    assert.ok(eResult.date);
    assert.ok(eResult.expiresOn);
    assert.ok(eResult.insertedOn);
    assert.ok(eResult.messageId);
    assert.ok(eResult.popReceipt);
    assert.ok(eResult.requestId);
    assert.ok(eResult.nextVisibleOn);
    assert.ok(eResult.version);

    let newMessage = new Array(64 * 1024 + 2).join("a");

    let error;
    try {
      await queueClient.updateMessage(
        eResult.messageId,
        eResult.popReceipt,
        newMessage,
        0
      );
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(
      error.message.includes(
        "The request body is too large and exceeds the maximum permissible limit."
      )
    );
  });

  it("delete message negative @loki", async () => {
    const eResult = await queueClient.sendMessage(messageContent);

    let error;
    try {
      await queueClient.deleteMessage(eResult.messageId, "invalid");
    } catch (err) {
      error = err;
    }
    assert.ok(error);
  });
});
