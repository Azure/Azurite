import * as assert from "assert";

import {
  Aborter,
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  AnonymousCredential,
  generateAccountSASQueryParameters,
  generateQueueSASQueryParameters,
  MessageIdURL,
  MessagesURL,
  QueueSASPermissions,
  QueueURL,
  SASProtocol,
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
  rmRecursive,
  sleep
} from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Queue SAS test", () => {
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

  it("generateAccountSASQueryParameters should work @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        startTime: now,
        version: "2019-02-02"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    await serviceURLWithSAS.getProperties(Aborter.none);
  });

  it("generateAccountSASQueryParameters should not work with invalid permission @loki", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        permissions: AccountSASPermissions.parse("wdlcup").toString(),
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString()
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    let error;
    try {
      await serviceURLWithSAS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }

    assert.ok(error);
    assert.deepEqual(error.statusCode, 403);
  });

  it("generateAccountSASQueryParameters should not work with invalid service @loki", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        permissions: AccountSASPermissions.parse("rwdlacup").toString(),
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btf").toString()
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    let error;
    try {
      await serviceURLWithSAS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.deepEqual(error.statusCode, 403);
  });

  it("generateAccountSASQueryParameters should not work with invalid resource type @loki", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    let error;
    try {
      await serviceURLWithSAS.getProperties(Aborter.none);
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.deepEqual(error.statusCode, 403);
  });

  it("Create queue should work with write (w) or create (c) permission in account SAS @loki", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas1 = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rdlacup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sas2 = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlaup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL1 = `${serviceURL.url}?${sas1}`;
    const sasURL2 = `${serviceURL.url}?${sas2}`;

    const serviceURLWithSAS1 = new ServiceURL(
      sasURL1,
      StorageURL.newPipeline(new AnonymousCredential())
    );
    const serviceURLWithSAS2 = new ServiceURL(
      sasURL2,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const queueName1 = getUniqueName("queue1");
    const queueName2 = getUniqueName("queue2");

    const queueURL1 = QueueURL.fromServiceURL(serviceURLWithSAS1, queueName1);
    await queueURL1.create(Aborter.none);

    const queueURL2 = QueueURL.fromServiceURL(serviceURLWithSAS2, queueName2);
    await queueURL2.create(Aborter.none);

    await queueURL1.delete(Aborter.none);
    await queueURL2.delete(Aborter.none);
  });

  it("Create queue shouldn't work without write (w) and create (c) permission in account SAS @loki", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rdlaup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const queueName = getUniqueName("queue");
    const queueURL = QueueURL.fromServiceURL(serviceURLWithSAS, queueName);
    // this copy should throw 403 error
    let error;
    try {
      await queueURL.create(Aborter.none);
    } catch (err) {
      error = err;
    }
    assert.deepEqual(error.statusCode, 403);
    assert.ok(error !== undefined);
  });

  it("generateAccountSASQueryParameters should work for queue @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlcaup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );
    const queueName = getUniqueName("queue");
    const queueURL = QueueURL.fromServiceURL(serviceURLWithSAS, queueName);
    await queueURL.create(Aborter.none);

    const properties = await queueURL.getProperties(Aborter.none);
    await queueURL.setMetadata(Aborter.none, properties.metadata);

    await queueURL.delete(Aborter.none);
  });

  it("Get/Set ACL with AccountSAS is not allowed @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    await queueURL.create(Aborter.none);

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlcaup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const queueURLwithSAS = QueueURL.fromServiceURL(
      serviceURLWithSAS,
      queueName
    );

    let errorGet;
    try {
      await queueURLwithSAS.getAccessPolicy(Aborter.none);
    } catch (err) {
      errorGet = err;
    }
    assert.ok(errorGet);
    assert.deepEqual(errorGet.statusCode, 403);

    let errorSet;
    try {
      await queueURLwithSAS.setAccessPolicy(Aborter.none);
    } catch (err) {
      errorSet = err;
    }
    assert.ok(errorSet);
    assert.deepEqual(errorSet.statusCode, 403);

    await queueURL.delete(Aborter.none);
  });

  it("generateAccountSASQueryParameters should work for messages @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    await queueURL.create(Aborter.none);

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlcaup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const queueURLwithSAS = QueueURL.fromServiceURL(
      serviceURLWithSAS,
      queueName
    );
    const messagesURLwithSAS = MessagesURL.fromQueueURL(queueURLwithSAS);
    const messageContent = "test text";

    await messagesURLwithSAS.enqueue(Aborter.none, messageContent);
    await messagesURLwithSAS.enqueue(Aborter.none, messageContent);
    await messagesURLwithSAS.peek(Aborter.none);
    await messagesURLwithSAS.dequeue(Aborter.none);
    await messagesURLwithSAS.clear(Aborter.none);

    let pResult2 = await messagesURLwithSAS.peek(Aborter.none);
    assert.deepStrictEqual(pResult2.peekedMessageItems.length, 0);

    await queueURL.delete(Aborter.none);
  });

  it("generateAccountSASQueryParameters should work for messages @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    await queueURL.create(Aborter.none);

    const sas = generateAccountSASQueryParameters(
      {
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlcaup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      sharedKeyCredential as SharedKeyCredential
    ).toString();

    const sasURL = `${serviceURL.url}?${sas}`;
    const serviceURLWithSAS = new ServiceURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const queueURLwithSAS = QueueURL.fromServiceURL(
      serviceURLWithSAS,
      queueName
    );
    const messagesURLwithSAS = MessagesURL.fromQueueURL(queueURLwithSAS);
    const messageContent = "test text";

    await messagesURLwithSAS.enqueue(Aborter.none, messageContent);
    await messagesURLwithSAS.enqueue(Aborter.none, messageContent);
    await messagesURLwithSAS.peek(Aborter.none);
    await messagesURLwithSAS.dequeue(Aborter.none);
    await messagesURLwithSAS.clear(Aborter.none);

    let pResult2 = await messagesURLwithSAS.peek(Aborter.none);
    assert.deepStrictEqual(pResult2.peekedMessageItems.length, 0);

    await queueURL.delete(Aborter.none);
  });

  it("generateQueueSASQueryParameters should work for queue @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    await queueURL.create(Aborter.none);

    const queueSAS = generateQueueSASQueryParameters(
      {
        queueName,
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: QueueSASPermissions.parse("raup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        startTime: now,
        version: "2019-02-02"
      },
      sharedKeyCredential as SharedKeyCredential
    );

    const sasURL = `${queueURL.url}?${queueSAS}`;
    const queueURLwithSAS = new QueueURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    await queueURLwithSAS.getProperties(Aborter.none);
    await queueURL.delete(Aborter.none);
  });

  it("generateQueueSASQueryParameters should work for messages @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    await queueURL.create(Aborter.none);

    const queueSAS = generateQueueSASQueryParameters(
      {
        queueName: queueName,
        expiryTime: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: QueueSASPermissions.parse("raup").toString(),
        protocol: SASProtocol.HTTPSandHTTP,
        startTime: now,
        version: "2016-05-31"
      },
      sharedKeyCredential as SharedKeyCredential
    );

    const messageContent = "Hello World!";

    const messagesURL = MessagesURL.fromQueueURL(queueURL);
    const sasURLForMessages = `${messagesURL.url}?${queueSAS}`;
    const messagesURLWithSAS = new MessagesURL(
      sasURLForMessages,
      StorageURL.newPipeline(new AnonymousCredential())
    );
    const enqueueResult = await messagesURLWithSAS.enqueue(
      Aborter.none,
      messageContent
    );

    let pResult = await messagesURL.peek(Aborter.none);
    assert.deepStrictEqual(pResult.peekedMessageItems.length, 1);

    const messageIdURL = MessageIdURL.fromMessagesURL(
      messagesURL,
      enqueueResult.messageId
    );
    const sasURLForMessageId = `${messageIdURL.url}?${queueSAS}`;
    const messageIdURLWithSAS = new MessageIdURL(
      sasURLForMessageId,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    await messageIdURLWithSAS.delete(Aborter.none, enqueueResult.popReceipt);

    pResult = await messagesURL.peek(Aborter.none);
    assert.deepStrictEqual(pResult.peekedMessageItems.length, 0);

    await queueURL.delete(Aborter.none);
  });

  it("generateQueueSASQueryParameters should work for queue with access policy @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = serviceURL.pipeline.factories;
    const sharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueURL = QueueURL.fromServiceURL(serviceURL, queueName);
    await queueURL.create(Aborter.none);

    const id = "unique-id";
    await queueURL.setAccessPolicy(Aborter.none, [
      {
        accessPolicy: {
          expiry: tmr,
          permission: QueueSASPermissions.parse("raup").toString(),
          start: now
        },
        id
      }
    ]);

    const queueSAS = generateQueueSASQueryParameters(
      {
        queueName,
        identifier: id
      },
      sharedKeyCredential as SharedKeyCredential
    );

    const messagesURL = MessagesURL.fromQueueURL(queueURL);

    const sasURL = `${messagesURL.url}?${queueSAS}`;
    const messagesURLwithSAS = new MessagesURL(
      sasURL,
      StorageURL.newPipeline(new AnonymousCredential())
    );

    const messageContent = "hello";

    const eResult = await messagesURLwithSAS.enqueue(
      Aborter.none,
      messageContent
    );
    assert.ok(eResult.messageId);
    const pResult = await messagesURLwithSAS.peek(Aborter.none);
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageText,
      messageContent
    );
    const dResult = await messagesURLwithSAS.dequeue(Aborter.none, {
      visibilitytimeout: 1
    });
    assert.deepStrictEqual(
      dResult.dequeuedMessageItems[0].messageText,
      messageContent
    );

    await sleep(2 * 1000);

    const messageIdURL = MessageIdURL.fromMessagesURL(
      messagesURL,
      dResult.dequeuedMessageItems[0].messageId
    );

    const sasURLForMessage = `${messageIdURL.url}?${queueSAS}`;
    const messageIdURLwithSAS = new MessageIdURL(
      sasURLForMessage,
      StorageURL.newPipeline(new AnonymousCredential())
    );
    const deleteResult = await messageIdURLwithSAS.delete(
      Aborter.none,
      dResult.dequeuedMessageItems[0].popReceipt
    );
    assert.ok(deleteResult.requestId);
  });
});
