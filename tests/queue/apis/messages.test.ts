import * as assert from "assert";

import {
  QueueServiceClient,
  newPipeline,
  StorageSharedKeyCredential,
  QueueClient
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

describe("Messages APIs test", () => {
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
    server = new Server(config);
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

  it("enqueue, peek, dequeue and clear message with default parameters @loki", async () => {
    const eResult = await queueClient.sendMessage(messageContent);
    assert.ok(eResult.date);
    assert.ok(eResult.expiresOn);
    assert.ok(eResult.insertedOn);
    assert.ok(eResult.messageId);
    assert.ok(eResult.popReceipt);
    assert.ok(eResult.requestId);
    assert.ok(eResult.nextVisibleOn);
    assert.ok(eResult.version);

    await queueClient.sendMessage(messageContent);

    const pResult = await queueClient.peekMessages();
    assert.ok(pResult.date);
    assert.ok(pResult.requestId);
    assert.ok(pResult.version);
    assert.deepStrictEqual(pResult.peekedMessageItems.length, 1);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageText,
      messageContent
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageId,
      eResult.messageId
    );

    let dqResult = await queueClient.receiveMessages();
    assert.ok(dqResult.date);
    assert.ok(dqResult.requestId);
    assert.ok(dqResult.version);
    assert.deepStrictEqual(dqResult.receivedMessageItems.length, 1);
    assert.ok(dqResult.receivedMessageItems[0].popReceipt);
    assert.deepStrictEqual(
      dqResult.receivedMessageItems[0].messageText,
      messageContent
    );
    assert.deepStrictEqual(
      dqResult.receivedMessageItems[0].messageId,
      eResult.messageId
    );
    assert.equal(
      dqResult._response.request.headers.get("x-ms-client-request-id"),
      dqResult.clientRequestId
    );

    const cResult = await queueClient.clearMessages();
    assert.ok(cResult.date);
    assert.ok(cResult.requestId);
    assert.ok(cResult.version);
    assert.equal(
      cResult._response.request.headers.get("x-ms-client-request-id"),
      cResult.clientRequestId
    );

    // check all messages are cleared
    const pResult2 = await queueClient.peekMessages();
    assert.ok(pResult2.date);
    assert.deepStrictEqual(pResult2.peekedMessageItems.length, 0);
  });

  it("enqueue, peek, dequeue and clear message with all parameters @loki", async () => {
    const eResult = await queueClient.sendMessage(messageContent, {
      messageTimeToLive: 40,
      visibilityTimeout: 0
    });
    assert.ok(eResult.date);
    assert.ok(eResult.expiresOn);
    assert.ok(eResult.insertedOn);
    assert.ok(eResult.messageId);
    assert.ok(eResult.popReceipt);
    assert.ok(eResult.requestId);
    assert.ok(eResult.nextVisibleOn);
    assert.ok(eResult.version);

    let eResult2 = await queueClient.sendMessage(messageContent, {
      messageTimeToLive: 40,
      visibilityTimeout: 0
    });
    await queueClient.sendMessage(messageContent, {
      messageTimeToLive: 10,
      visibilityTimeout: 5
    });
    await queueClient.sendMessage(messageContent, {
      messageTimeToLive: Number.MAX_SAFE_INTEGER,
      visibilityTimeout: 19
    });

    let pResult = await queueClient.peekMessages({
      numberOfMessages: 2
    });
    assert.ok(pResult.date);
    assert.ok(pResult.requestId);
    assert.ok(pResult.version);
    assert.deepStrictEqual(pResult.peekedMessageItems.length, 2);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageText,
      messageContent
    );
    assert.deepStrictEqual(pResult.peekedMessageItems[0].dequeueCount, 0);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageId,
      eResult.messageId
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].insertedOn,
      eResult.insertedOn
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].expiresOn,
      eResult.expiresOn
    );

    assert.deepStrictEqual(
      pResult.peekedMessageItems[1].messageText,
      messageContent
    );
    assert.deepStrictEqual(pResult.peekedMessageItems[1].dequeueCount, 0);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[1].messageId,
      eResult2.messageId
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[1].insertedOn,
      eResult2.insertedOn
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[1].expiresOn,
      eResult2.expiresOn
    );

    let dResult = await queueClient.receiveMessages({
      visibilitytimeout: 10,
      numberOfMessages: 2
    });
    assert.ok(dResult.date);
    assert.ok(dResult.requestId);
    assert.ok(dResult.version);
    assert.deepStrictEqual(dResult.receivedMessageItems.length, 2);
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].messageText,
      messageContent
    );
    assert.deepStrictEqual(dResult.receivedMessageItems[0].dequeueCount, 1);
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].messageId,
      eResult.messageId
    );
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].insertedOn,
      eResult.insertedOn
    );
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].expiresOn,
      eResult.expiresOn
    );
    assert.ok(dResult.receivedMessageItems[0].popReceipt);
    assert.ok(dResult.receivedMessageItems[0].nextVisibleOn);

    assert.deepStrictEqual(
      pResult.peekedMessageItems[1].messageText,
      messageContent
    );

    // check no message is visible
    let pResult2 = await queueClient.peekMessages();
    assert.ok(pResult2.date);
    assert.deepStrictEqual(pResult2.peekedMessageItems.length, 0);
  });

  it("enqueue, peek, dequeue empty message, and peek, dequeue with numberOfMessages > count(messages) @loki", async () => {
    const eResult = await queueClient.sendMessage("", {
      messageTimeToLive: 40,
      visibilityTimeout: 0
    });
    assert.ok(eResult.date);
    assert.ok(eResult.expiresOn);
    assert.ok(eResult.insertedOn);
    assert.ok(eResult.messageId);
    assert.ok(eResult.popReceipt);
    assert.ok(eResult.requestId);
    assert.ok(eResult.nextVisibleOn);
    assert.ok(eResult.version);

    const pResult = await queueClient.peekMessages({
      numberOfMessages: 2
    });
    assert.ok(pResult.date);
    assert.ok(pResult.requestId);
    assert.ok(pResult.version);
    assert.deepStrictEqual(pResult.peekedMessageItems.length, 1);
    assert.deepStrictEqual(pResult.peekedMessageItems[0].messageText, "");
    assert.deepStrictEqual(pResult.peekedMessageItems[0].dequeueCount, 0);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageId,
      eResult.messageId
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].insertedOn,
      eResult.insertedOn
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].expiresOn,
      eResult.expiresOn
    );

    let dResult = await queueClient.receiveMessages({
      visibilitytimeout: 10,
      numberOfMessages: 2
    });
    assert.ok(dResult.date);
    assert.ok(dResult.requestId);
    assert.ok(dResult.version);
    assert.deepStrictEqual(dResult.receivedMessageItems.length, 1);
    assert.deepStrictEqual(dResult.receivedMessageItems[0].messageText, "");
    assert.deepStrictEqual(dResult.receivedMessageItems[0].dequeueCount, 1);
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].messageId,
      eResult.messageId
    );
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].insertedOn,
      eResult.insertedOn
    );
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].expiresOn,
      eResult.expiresOn
    );
    assert.ok(dResult.receivedMessageItems[0].popReceipt);
    assert.ok(dResult.receivedMessageItems[0].nextVisibleOn);
  });

  it("enqueue, peek, dequeue special characters @loki", async () => {
    let specialMessage =
      "!@#$%^&*()_+`-=[]|};'\":,./?><`~漢字㒈保ᨍ揫^p[뷁)׷񬓔7񈺝l鮍򧽶ͺ簣ڞ츊䈗㝯綞߫⯹?ÎᦡC왶żsmt㖩닡򈸱𕩣ОլFZ򃀮9tC榅ٻ컦驿Ϳ[𱿛봻烌󱰷򙥱Ռ򽒏򘤰δŊϜ췮㐦9ͽƙp퐂ʩ由巩KFÓ֮򨾭⨿󊻅aBm󶴂旨Ϣ񓙠򻐪񇧱򆋸ջ֨ipn򒷐ꝷՆ򆊙斡賆𒚑m˞𻆕󛿓򐞺Ӯ򡗺򴜍<񐸩԰Bu)򁉂񖨞á<џɏ嗂�⨣1PJ㬵┡ḸI򰱂ˮaࢸ۳i灛ȯɨb𹺪򕕱뿶uٔ䎴񷯆Φ륽󬃨س_NƵ¦\u00E9";

    let eResult = await queueClient.sendMessage(specialMessage, {
      messageTimeToLive: 40,
      visibilitytimeout: 0
    });
    assert.ok(eResult.date);
    assert.ok(eResult.expiresOn);
    assert.ok(eResult.insertedOn);
    assert.ok(eResult.messageId);
    assert.ok(eResult.popReceipt);
    assert.ok(eResult.requestId);
    assert.ok(eResult.nextVisibleOn);
    assert.ok(eResult.version);

    let pResult = await queueClient.peekMessages({ numberOfMessages: 2 });
    assert.ok(pResult.date);
    assert.ok(pResult.requestId);
    assert.ok(pResult.version);
    assert.deepStrictEqual(pResult.peekedMessageItems.length, 1);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageText,
      specialMessage
    );
    assert.deepStrictEqual(pResult.peekedMessageItems[0].dequeueCount, 0);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageId,
      eResult.messageId
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].insertedOn,
      eResult.insertedOn
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].expiresOn,
      eResult.expiresOn
    );

    let dResult = await queueClient.receiveMessages({
      visibilitytimeout: 10,
      numberOfMessages: 2
    });
    assert.ok(dResult.date);
    assert.ok(dResult.requestId);
    assert.ok(dResult.version);
    assert.deepStrictEqual(dResult.receivedMessageItems.length, 1);
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].messageText,
      specialMessage
    );
    assert.deepStrictEqual(dResult.receivedMessageItems[0].dequeueCount, 1);
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].messageId,
      eResult.messageId
    );
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].insertedOn,
      eResult.insertedOn
    );
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].expiresOn,
      eResult.expiresOn
    );
    assert.ok(dResult.receivedMessageItems[0].popReceipt);
    assert.ok(dResult.receivedMessageItems[0].nextVisibleOn);
  });

  it("enqueue, peek, dequeue with 64KB characters size which is computed after encoding @loki", async () => {
    let messageContent = new Array(64 * 1024 + 1).join("a");

    const eResult = await queueClient.sendMessage(messageContent, {
      messageTimeToLive: 40,
      visibilityTimeout: 0
    });
    assert.ok(eResult.date);
    assert.ok(eResult.expiresOn);
    assert.ok(eResult.insertedOn);
    assert.ok(eResult.messageId);
    assert.ok(eResult.popReceipt);
    assert.ok(eResult.requestId);
    assert.ok(eResult.nextVisibleOn);
    assert.ok(eResult.version);

    let pResult = await queueClient.peekMessages({ numberOfMessages: 2 });
    assert.ok(pResult.date);
    assert.ok(pResult.requestId);
    assert.ok(pResult.version);
    assert.deepStrictEqual(pResult.peekedMessageItems.length, 1);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageText,
      messageContent
    );
    assert.deepStrictEqual(pResult.peekedMessageItems[0].dequeueCount, 0);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageId,
      eResult.messageId
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].insertedOn,
      eResult.insertedOn
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].expiresOn,
      eResult.expiresOn
    );

    let dResult = await queueClient.receiveMessages({
      visibilitytimeout: 10,
      numberOfMessages: 2
    });
    assert.ok(dResult.date);
    assert.ok(dResult.requestId);
    assert.ok(dResult.version);
    assert.deepStrictEqual(dResult.receivedMessageItems.length, 1);
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].messageText,
      messageContent
    );
    assert.deepStrictEqual(dResult.receivedMessageItems[0].dequeueCount, 1);
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].messageId,
      eResult.messageId
    );
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].insertedOn,
      eResult.insertedOn
    );
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].expiresOn,
      eResult.expiresOn
    );
    assert.ok(dResult.receivedMessageItems[0].popReceipt);
    assert.ok(dResult.receivedMessageItems[0].nextVisibleOn);
  });

  it("enqueue, peek and dequeue negative @loki", async () => {
    const eResult = await queueClient.sendMessage(messageContent, {
      messageTimeToLive: 40
    });
    assert.ok(eResult.date);
    assert.ok(eResult.expiresOn);
    assert.ok(eResult.insertedOn);
    assert.ok(eResult.messageId);
    assert.ok(eResult.popReceipt);
    assert.ok(eResult.requestId);
    assert.ok(eResult.nextVisibleOn);
    assert.ok(eResult.version);
    let error;
    try {
      await queueClient.sendMessage(messageContent, {
        messageTimeToLive: 30,
        visibilityTimeout: 30
      });
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    let errorPeek;
    try {
      await queueClient.peekMessages({ numberOfMessages: 100 });
    } catch (err) {
      errorPeek = err;
    }
    assert.ok(errorPeek);

    let pResult = await queueClient.peekMessages({ numberOfMessages: 2 });
    assert.ok(pResult.date);
    assert.ok(pResult.requestId);
    assert.ok(pResult.version);
    assert.deepStrictEqual(pResult.peekedMessageItems.length, 1);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageText,
      messageContent
    );
    assert.deepStrictEqual(pResult.peekedMessageItems[0].dequeueCount, 0);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageId,
      eResult.messageId
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].insertedOn,
      eResult.insertedOn
    );
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].expiresOn,
      eResult.expiresOn
    );

    // Note visibility time could be larger then message time to live for dequeue.
    await queueClient.receiveMessages({
      visibilitytimeout: 40,
      numberOfMessages: 2
    });
  });

  it("enqueue negative with 65537B(64KB+1B) characters size which is computed after encoding @loki", async () => {
    let messageContent = new Array(64 * 1024 + 2).join("a");

    let error;
    try {
      await queueClient.sendMessage(messageContent, {});
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
});
