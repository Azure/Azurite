import * as assert from "assert";

import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  AnonymousCredential,
  generateAccountSASQueryParameters,
  generateQueueSASQueryParameters,
  QueueSASPermissions,
  SASProtocol,
  StorageSharedKeyCredential,
  QueueServiceClient,
  newPipeline,
  QueueClient
} from "@azure/storage-queue";

import { configLogger } from "../../src/common/Logger";
import { StoreDestinationArray } from "../../src/common/persistence/IExtentStore";
import Server from "../../src/queue/QueueServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  rmRecursive,
  sleep
} from "../testutils";
import QueueTestServerFactory from "./utils/QueueTestServerFactory";

// Set true to enable debug log
configLogger(false);

describe("Queue SAS test", () => {
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

  it("generateAccountSASQueryParameters should work @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        startsOn: now,
        version: "2019-02-02"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await serviceClientWithSAS.getProperties();
  });

  it("generateAccountSASQueryParameters should not work with invalid permission @loki", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        permissions: AccountSASPermissions.parse("wdlcup"),
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString()
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    let error;
    try {
      await serviceClientWithSAS.getProperties();
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
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        permissions: AccountSASPermissions.parse("rwdlacup"),
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btf").toString()
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    let error;
    try {
      await serviceClientWithSAS.getProperties();
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
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    let error;
    try {
      await serviceClientWithSAS.getProperties();
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.deepEqual(error.statusCode, 403);
  });

  it("generateAccountSASQueryParameters should not work with invalid signature @loki", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    let sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        permissions: AccountSASPermissions.parse("rwdlacup"),
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString()
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();
    sas = sas + "1";

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    let error;
    try {
      await serviceClientWithSAS.getProperties();
    } catch (err) {
      error = err;
    }

    assert.ok(error);
    assert.deepEqual(error.statusCode, 403);
    assert.deepEqual(error.code, 'AuthenticationFailed');
  });

  it("Create queue should work with write (w) or create (c) permission in account SAS @loki", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas1 = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rdlacup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sas2 = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlaup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL1 = `${serviceClient.url}?${sas1}`;
    const sasURL2 = `${serviceClient.url}?${sas2}`;

    const serviceClientWithSAS1 = new QueueServiceClient(
      sasURL1,
      newPipeline(new AnonymousCredential())
    );
    const serviceClientWithSAS2 = new QueueServiceClient(
      sasURL2,
      newPipeline(new AnonymousCredential())
    );

    const queueName1 = getUniqueName("queue1");
    const queueName2 = getUniqueName("queue2");

    const queueClient1 = serviceClientWithSAS1.getQueueClient(queueName1);
    await queueClient1.create();

    const queueClient2 = serviceClientWithSAS2.getQueueClient(queueName2);
    await queueClient2.create();

    await queueClient1.delete();
    await queueClient2.delete();
  });

  it("Create queue shouldn't work without write (w) and create (c) permission in account SAS @loki", async () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rdlaup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const queueName = getUniqueName("queue");
    const queueClient = serviceClientWithSAS.getQueueClient(queueName);
    // this copy should throw 403 error
    let error;
    try {
      await queueClient.create();
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
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlcaup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );
    const queueName = getUniqueName("queue");
    const queueClient = serviceClientWithSAS.getQueueClient(queueName);
    await queueClient.create();

    const properties = await queueClient.getProperties();
    await queueClient.setMetadata(properties.metadata);

    await queueClient.delete();
  });

  it("Get/Set ACL with AccountSAS is not allowed @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlcaup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const queueClientWithSAS = serviceClientWithSAS.getQueueClient(queueName);

    let errorGet;
    try {
      await queueClientWithSAS.getAccessPolicy();
    } catch (err) {
      errorGet = err;
    }
    assert.ok(errorGet);
    assert.deepEqual(errorGet.statusCode, 403);

    let errorSet;
    try {
      await queueClientWithSAS.setAccessPolicy();
    } catch (err) {
      errorSet = err;
    }
    assert.ok(errorSet);
    assert.deepEqual(errorSet.statusCode, 403);

    await queueClient.delete();
  });

  it("generateAccountSASQueryParameters should work for messages @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlcaup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const queueClientWithSAS = serviceClientWithSAS.getQueueClient(queueName);
    const messageContent = "test text";

    await queueClientWithSAS.sendMessage(messageContent);
    await queueClientWithSAS.sendMessage(messageContent);
    await queueClientWithSAS.peekMessages();
    await queueClientWithSAS.receiveMessages();
    await queueClientWithSAS.clearMessages();

    let pResult2 = await queueClientWithSAS.peekMessages();
    assert.deepStrictEqual(pResult2.peekedMessageItems.length, 0);

    await queueClient.delete();
  });

  it("generateAccountSASQueryParameters should work for messages @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();

    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlcaup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("co").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        version: "2019-02-02"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    ).toString();

    const sasURL = `${serviceClient.url}?${sas}`;
    const serviceClientWithSAS = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const queueClientWithSAS = serviceClientWithSAS.getQueueClient(queueName);
    const messageContent = "test text";

    await queueClientWithSAS.sendMessage(messageContent);
    await queueClientWithSAS.sendMessage(messageContent);
    await queueClientWithSAS.peekMessages();
    await queueClientWithSAS.receiveMessages();
    await queueClientWithSAS.clearMessages();

    let pResult2 = await queueClientWithSAS.peekMessages();
    assert.deepStrictEqual(pResult2.peekedMessageItems.length, 0);

    await queueClient.delete();
  });

  it("generateQueueSASQueryParameters should work for queue @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();

    const queueSAS = generateQueueSASQueryParameters(
      {
        queueName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: QueueSASPermissions.parse("raup"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2019-02-02"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${queueClient.url}?${queueSAS}`;
    const queueClientWithSAS = new QueueClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await queueClientWithSAS.getProperties();
    await queueClient.delete();
  });

  it("generateQueueSASQueryParameters should work for messages @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();

    const queueSAS = generateQueueSASQueryParameters(
      {
        queueName: queueName,
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: QueueSASPermissions.parse("raup"),
        protocol: SASProtocol.HttpsAndHttp,
        startsOn: now,
        version: "2016-05-31"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const messageContent = "Hello World!";

    const sasURLForMessages = `${queueClient.url}?${queueSAS}`;
    const queueClientWithSAS = new QueueClient(
      sasURLForMessages,
      newPipeline(new AnonymousCredential())
    );
    const enqueueResult = await queueClientWithSAS.sendMessage(messageContent);

    let pResult = await queueClientWithSAS.peekMessages();
    assert.deepStrictEqual(pResult.peekedMessageItems.length, 1);

    const sasURLForMessageId = `${queueClientWithSAS.url}?${queueSAS}`;
    const queueIdClientWithSAS = new QueueClient(
      sasURLForMessageId,
      newPipeline(new AnonymousCredential())
    );

    await queueIdClientWithSAS.deleteMessage(
      enqueueResult.messageId,
      enqueueResult.popReceipt
    );

    pResult = await queueClient.peekMessages();
    assert.deepStrictEqual(pResult.peekedMessageItems.length, 0);

    await queueClient.delete();
  });

  it("generateQueueSASQueryParameters should work for queue with access policy @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();

    const id = "unique-id";
    await queueClient.setAccessPolicy([
      {
        accessPolicy: {
          expiresOn: tmr,
          permissions: QueueSASPermissions.parse("raup").toString(),
          startsOn: now
        },
        id
      }
    ]);

    const queueSAS = generateQueueSASQueryParameters(
      {
        queueName,
        identifier: id
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${queueClient.url}?${queueSAS}`;
    const queueClientWithSAS = new QueueClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    const messageContent = "hello";

    const eResult = await queueClientWithSAS.sendMessage(messageContent);
    assert.ok(eResult.messageId);
    const pResult = await queueClientWithSAS.peekMessages();
    assert.deepStrictEqual(
      pResult.peekedMessageItems[0].messageText,
      messageContent
    );
    const dResult = await queueClientWithSAS.receiveMessages({
      visibilitytimeout: 1
    });
    assert.deepStrictEqual(
      dResult.receivedMessageItems[0].messageText,
      messageContent
    );

    await sleep(2 * 1000);

    const sasURLForMessage = `${queueClientWithSAS.url}?${queueSAS}`;
    const queueIdClientWithSAS = new QueueClient(
      sasURLForMessage,
      newPipeline(new AnonymousCredential())
    );
    const deleteResult = await queueIdClientWithSAS.deleteMessage(
      dResult.receivedMessageItems[0].messageId,
      dResult.receivedMessageItems[0].popReceipt
    );
    assert.ok(deleteResult.requestId);
  });  

  it("generateQueueSASQueryParameters should work without startTime @loki", async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    // By default, credential is always the last element of pipeline factories
    const factories = (serviceClient as any).pipeline.factories;
    const storageSharedKeyCredential = factories[factories.length - 1];

    const queueName = getUniqueName("queue");
    const queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();

    const queueSAS = generateQueueSASQueryParameters(
      {
        queueName,
        expiresOn: tmr,
        permissions: QueueSASPermissions.parse("raup"),
        version: "2019-02-02"
      },
      storageSharedKeyCredential as StorageSharedKeyCredential
    );

    const sasURL = `${queueClient.url}?${queueSAS}`;
    const queueClientWithSAS = new QueueClient(
      sasURL,
      newPipeline(new AnonymousCredential())
    );

    await queueClientWithSAS.getProperties();
    await queueClient.delete();
  });
});
