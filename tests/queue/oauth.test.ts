import { QueueServiceClient, newPipeline, generateAccountSASQueryParameters, AccountSASPermissions, SASProtocol, AccountSASResourceTypes, AccountSASServices, AnonymousCredential, generateQueueSASQueryParameters, QueueSASPermissions, StorageSharedKeyCredential } from "@azure/storage-queue";

import * as assert from "assert";
import Server from "../../src/queue/QueueServer";

import { configLogger } from "../../src/common/Logger";
import { StoreDestinationArray } from "../../src/common/persistence/IExtentStore";
import { EMULATOR_ACCOUNT_KEY, generateJWTToken, getUniqueName } from "../testutils";
import { SimpleTokenCredential } from "../simpleTokenCredential";
import QueueTestServerFactory from "./utils/QueueTestServerFactory";
import { AzuriteTelemetryClient } from "../../src/common/Telemetry";

// Set true to enable debug log
configLogger(false);

describe("Queue OAuth Basic", () => {
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

  const baseURL = `https://${host}:${port}/devstoreaccount1`;

  before(async () => {
    server = new QueueTestServerFactory().createServer({
      metadataDBPath: metadataDbPath,
      extentDBPath: extentDbPath,
      persistencePathArray: DEFAULT_QUEUE_PERSISTENCE_ARRAY,
      https: true,
      oauth: "basic"
    })
    await server.start();
    AzuriteTelemetryClient.init("", true, undefined);
    await AzuriteTelemetryClient.TraceStartEvent("Queue Test");
  });

  after(async () => {
    await server.close();
    await server.clean();
    AzuriteTelemetryClient.TraceStopEvent("Queue Test");
  });

  it(`Should work with create container @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://storage.azure.com",
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
    );

    const serviceClient = new QueueServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const queueName: string = getUniqueName("1queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);

    await queueClient.create();
    await queueClient.delete();
  });

  it(`Should not work with invalid JWT token @loki @sql`, async () => {
    const serviceClient = new QueueServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential("invalid token"), {
        retryOptions: { maxTries: 1 }
      })
    );

    const queueName: string = getUniqueName("1queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);

    try {
      await queueClient.create();
      await queueClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      return;
    }
    assert.fail();
  });

  it(`Should work with valid audiences @loki @sql`, async () => {
    const audiences = [
      "https://storage.azure.com",
      "https://storage.azure.com/",
      "e406a681-f3d4-42a8-90b6-c2b029497af1",
      "https://devstoreaccount1.queue.core.windows.net",
      "https://devstoreaccount1.queue.core.windows.net/",
      "https://devstoreaccount1.queue.core.chinacloudapi.cn",
      "https://devstoreaccount1.queue.core.chinacloudapi.cn/",
      "https://devstoreaccount1.queue.core.usgovcloudapi.net",
      "https://devstoreaccount1.queue.core.usgovcloudapi.net/",
      "https://devstoreaccount1.queue.core.cloudapi.de",
      "https://devstoreaccount1.queue.core.cloudapi.de/"
    ];

    for (const audience of audiences) {
      const token = generateJWTToken(
        new Date("2019/01/01"),
        new Date("2019/01/01"),
        new Date("2100/01/01"),
        "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
        audience,
        "user_impersonation",
        "23657296-5cd5-45b0-a809-d972a7f4dfe1",
        "dd0d0df1-06c3-436c-8034-4b9a153097ce"
      );

      const serviceClient = new QueueServiceClient(
        baseURL,
        newPipeline(new SimpleTokenCredential(token), {
          retryOptions: { maxTries: 1 }
        })
      );

      const queueName: string = getUniqueName("1queue-with-dash");
      const queueClient = serviceClient.getQueueClient(queueName);

      await queueClient.create();
      await queueClient.delete();
    }
  });

  it(`Should not work with invalid audiences @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://invalidaccount.queue.core.windows.net",
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
    );

    const serviceClient = new QueueServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const queueName: string = getUniqueName("1queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);

    try {
      await queueClient.create();
      await queueClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      assert.deepStrictEqual(err.details.AuthenticationErrorDetail.includes("audience"), true);
      return;
    }
    assert.fail();
  });

  it(`Should work with valid issuers @loki @sql`, async () => {
    const issuerPrefixes = [
      "https://sts.windows.net/",
      "https://sts.microsoftonline.de/",
      "https://sts.chinacloudapi.cn/",
      "https://sts.windows-ppe.net"
    ];

    for (const issuerPrefix of issuerPrefixes) {
      const token = generateJWTToken(
        new Date("2019/01/01"),
        new Date("2019/01/01"),
        new Date("2100/01/01"),
        `${issuerPrefix}/ab1f708d-50f6-404c-a006-d71b2ac7a606/`,
        "e406a681-f3d4-42a8-90b6-c2b029497af1",
        "user_impersonation",
        "23657296-5cd5-45b0-a809-d972a7f4dfe1",
        "dd0d0df1-06c3-436c-8034-4b9a153097ce"
      );

      const serviceClient = new QueueServiceClient(
        baseURL,
        newPipeline(new SimpleTokenCredential(token), {
          retryOptions: { maxTries: 1 }
        })
      );

      const queueName: string = getUniqueName("1queue-with-dash");
      const queueClient = serviceClient.getQueueClient(queueName);

      await queueClient.create();
      await queueClient.delete();
    }
  });

  it(`Should not work with invalid issuers @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://invalidissuer/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://invalidaccount.queue.core.windows.net",
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
    );

    const serviceClient = new QueueServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const queueName: string = getUniqueName("1queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);

    try {
      await queueClient.create();
      await queueClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      assert.deepStrictEqual(err.details.AuthenticationErrorDetail.includes("issuer"), true);
      return;
    }
    assert.fail();
  });

  it(`Should not work with invalid nbf @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2119/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.queue.core.windows.net",
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
    );

    const serviceClient = new QueueServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const queueName: string = getUniqueName("1queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);

    try {
      await queueClient.create();
      await queueClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      assert.deepStrictEqual(err.details.AuthenticationErrorDetail.includes("Lifetime"), true);
      return;
    }
    assert.fail();
  });

  it(`Should not work with invalid exp @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.queue.core.windows.net",
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
    );

    const serviceClient = new QueueServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const queueName: string = getUniqueName("1queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);

    try {
      await queueClient.create();
      await queueClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      assert.deepStrictEqual(err.details.AuthenticationErrorDetail.includes("expire"), true);
      return;
    }
    assert.fail();
  });

  it(`Should not work with get container ACL @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.queue.core.windows.net",
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
    );

    const serviceClient = new QueueServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const queueName: string = getUniqueName("1queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();

    try {
      await queueClient.getAccessPolicy();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      await queueClient.delete();
      return;
    }
    await queueClient.delete();
    assert.fail();
  });

  it(`Should not work with set container ACL @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.queue.core.windows.net",
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
    );

    const serviceClient = new QueueServiceClient(
      baseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const queueName: string = getUniqueName("1queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);
    await queueClient.create();

    try {
      await queueClient.setAccessPolicy([]);
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Server failed to authenticate the request."),
        true
      );
      await queueClient.delete();
      return;
    }
    await queueClient.delete();
    assert.fail();
  });

  it("Create Queue with not exist Account, return 404 @loki @sql", async () => {
    const accountNameNotExist = "devstoreaccountnotexist";
    const invalidBaseURL = `https://${server.config.host}:${port}/${accountNameNotExist}`;
    const queueName: string = getUniqueName("queue");

    // Shared key
    const sharedKeyCredential = new StorageSharedKeyCredential(
      accountNameNotExist,
      EMULATOR_ACCOUNT_KEY
    );
    let serviceClient = new QueueServiceClient(
      invalidBaseURL,
      newPipeline(
        sharedKeyCredential,
        {
          retryOptions: { maxTries: 1 },
          // Make sure socket is closed once the operation is done.
          keepAliveOptions: { enable: false }
        }
      )
    );
    let queueClientNotExist = serviceClient.getQueueClient(queueName);  
    try {
      await queueClientNotExist.create();
    } catch (err) {
      if (err.statusCode !== 404 && err.code !== 'ResourceNotFound'){
        assert.fail( "Create Queue with shared key not fail as expected." + err.toString()); 
      }
    }

    // Oauth
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://storage.azure.com",
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
    );

    serviceClient = new QueueServiceClient(
      invalidBaseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 },
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );
    queueClientNotExist = serviceClient.getQueueClient(queueName);  
    try {
      await queueClientNotExist.create();
    } catch (err) {
      if (err.statusCode !== 404 && err.code !== 'ResourceNotFound'){
        assert.fail( "Create queue with oauth not fail as expected." + err.toString()); 
      }
    }

    // Account SAS
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); 
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    const sas = generateAccountSASQueryParameters(
      {
        expiresOn: tmr,
        ipRange: { start: "0.0.0.0", end: "255.255.255.255" },
        permissions: AccountSASPermissions.parse("rwdlacup"),
        protocol: SASProtocol.HttpsAndHttp,
        resourceTypes: AccountSASResourceTypes.parse("sco").toString(),
        services: AccountSASServices.parse("btqf").toString(),
        startsOn: now,
        version: "2016-05-31"
      },
      sharedKeyCredential
    ).toString();
    let sasURL = `${serviceClient.url}?${sas}`;
    let serviceClientSas = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );
    queueClientNotExist = serviceClientSas.getQueueClient(queueName);  
    try {
      await queueClientNotExist.create();
    } catch (err) {
      if (err.statusCode !== 404 && err.code !== 'ResourceNotFound'){
        assert.fail( "Create queue with account sas not fail as expected." + err.toString()); 
      }
    }

    // Service SAS
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
      sharedKeyCredential
    );
    sasURL = `${serviceClient.url}?${queueSAS}`;
    serviceClientSas = new QueueServiceClient(
      sasURL,
      newPipeline(new AnonymousCredential(), {
        // Make sure socket is closed once the operation is done.
        keepAliveOptions: { enable: false }
      })
    );
    queueClientNotExist = serviceClientSas.getQueueClient(queueName);
    try {
      await queueClientNotExist.create();
    } catch (err) {
      if (err.statusCode !== 404 && err.code !== 'ResourceNotFound'){
        assert.fail( "Create queue with service sas not fail as expected." + err.toString()); 
      }
    }
  });

  it(`Should not work with HTTP @loki @sql`, async () => {
    await server.close();
    await server.clean();

    server = new QueueTestServerFactory().createServer({
      metadataDBPath: metadataDbPath,
      extentDBPath: extentDbPath,
      persistencePathArray: DEFAULT_QUEUE_PERSISTENCE_ARRAY,
      oauth: "basic"
    })
    await server.start();

    const httpBaseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;

    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.queue.core.windows.net",
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
    );

    const serviceClient = new QueueServiceClient(
      httpBaseURL,
      newPipeline(new SimpleTokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const queueName: string = getUniqueName("1queue-with-dash");
    const queueClient = serviceClient.getQueueClient(queueName);

    try {
      await queueClient.create();
      await queueClient.delete();
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("Bearer token authentication is not permitted"),
        true
      );
      assert.deepStrictEqual(err.message.includes("non-https"), true);
      return;
    }
    assert.fail();
  });
});
