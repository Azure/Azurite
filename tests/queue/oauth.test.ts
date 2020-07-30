import { QueueServiceClient, newPipeline } from "@azure/storage-queue";

import * as assert from "assert";
import Server from "../../src/queue/QueueServer";

import { configLogger } from "../../src/common/Logger";
import { StoreDestinationArray } from "../../src/common/persistence/IExtentStore";
import QueueConfiguration from "../../src/queue/QueueConfiguration";
import { generateJWTToken, getUniqueName } from "../testutils";
import { SimpleTokenCredential } from "../simpleTokenCredential";

// Set true to enable debug log
configLogger(false);

describe("Queue OAuth Basic", () => {
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
    false,
    undefined,
    undefined,
    undefined,
    false,
    false,
    "tests/server.cert",
    "tests/server.key",
    undefined,
    "basic"
  );

  let server: Server;

  const baseURL = `https://${host}:${port}/devstoreaccount1`;

  before(async () => {
    server = new Server(config);
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it(`Should work with create container @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://storage.azure.com",
      "user_impersonation"
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
        err.message.includes("AuthenticationFailed"),
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
        "user_impersonation"
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
      "user_impersonation"
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
        err.message.includes("AuthenticationFailed"),
        true
      );
      assert.deepStrictEqual(err.message.includes("audience"), true);
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
        "user_impersonation"
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
      "user_impersonation"
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
        err.message.includes("AuthenticationFailed"),
        true
      );
      assert.deepStrictEqual(err.message.includes("issuer"), true);
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
      "user_impersonation"
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
        err.message.includes("AuthenticationFailed"),
        true
      );
      assert.deepStrictEqual(err.message.includes("Lifetime"), true);
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
      "user_impersonation"
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
        err.message.includes("AuthenticationFailed"),
        true
      );
      assert.deepStrictEqual(err.message.includes("expire"), true);
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
      "user_impersonation"
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
        err.message.includes("AuthorizationFailure"),
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
      "user_impersonation"
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
        err.message.includes("AuthorizationFailure"),
        true
      );
      await queueClient.delete();
      return;
    }
    await queueClient.delete();
    assert.fail();
  });

  it(`Should not work with HTTP @loki @sql`, async () => {
    await server.close();
    await server.clean();

    server = new Server(
      new QueueConfiguration(
        host,
        port,
        metadataDbPath,
        extentDbPath,
        DEFUALT_QUEUE_PERSISTENCE_ARRAY,
        false,
        undefined,
        undefined,
        undefined,
        false,
        false,
        undefined,
        undefined,
        undefined,
        "basic"
      )
    );
    await server.start();

    const httpBaseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;

    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.queue.core.windows.net",
      "user_impersonation"
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
        err.message.includes("AuthenticationFailed"),
        true
      );
      assert.deepStrictEqual(err.message.includes("HTTP"), true);
      return;
    }
    assert.fail();
  });
});
