import {
  Aborter,
  ContainerURL,
  ServiceURL,
  StorageURL,
  TokenCredential
} from "@azure/storage-blob";

import * as assert from "assert";

import { configLogger } from "../../src/common/Logger";
import BlobTestServerFactory from "../BlobTestServerFactory";
import { generateJWTToken, getUniqueName } from "../testutils";

// Set true to enable debug log
configLogger(false);

describe("Blob OAuth Basic", () => {
  const factory = new BlobTestServerFactory();
  let server = factory.createServer(false, false, true, "basic");
  const baseURL = `https://${server.config.host}:${server.config.port}/devstoreaccount1`;

  before(async () => {
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

    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(new TokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

    await containerURL.create(Aborter.none);
    await containerURL.delete(Aborter.none);
  });

  it(`Should not work with invalid JWT token @loki @sql`, async () => {
    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(new TokenCredential("invalid token"), {
        retryOptions: { maxTries: 1 }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

    try {
      await containerURL.create(Aborter.none);
      await containerURL.delete(Aborter.none);
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
      "https://devstoreaccount1.blob.core.windows.net",
      "https://devstoreaccount1.blob.core.windows.net/",
      "https://devstoreaccount1.blob.core.chinacloudapi.cn",
      "https://devstoreaccount1.blob.core.chinacloudapi.cn/",
      "https://devstoreaccount1.blob.core.usgovcloudapi.net",
      "https://devstoreaccount1.blob.core.usgovcloudapi.net/",
      "https://devstoreaccount1.blob.core.cloudapi.de",
      "https://devstoreaccount1.blob.core.cloudapi.de/"
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

      const serviceURL = new ServiceURL(
        baseURL,
        StorageURL.newPipeline(new TokenCredential(token), {
          retryOptions: { maxTries: 1 }
        })
      );

      const containerName: string = getUniqueName("1container-with-dash");
      const containerURL = ContainerURL.fromServiceURL(
        serviceURL,
        containerName
      );

      await containerURL.create(Aborter.none);
      await containerURL.delete(Aborter.none);
    }
  });

  it(`Should not work with invalid audiences @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://invalidaccount.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(new TokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

    try {
      await containerURL.create(Aborter.none);
      await containerURL.delete(Aborter.none);
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

      const serviceURL = new ServiceURL(
        baseURL,
        StorageURL.newPipeline(new TokenCredential(token), {
          retryOptions: { maxTries: 1 }
        })
      );

      const containerName: string = getUniqueName("1container-with-dash");
      const containerURL = ContainerURL.fromServiceURL(
        serviceURL,
        containerName
      );

      await containerURL.create(Aborter.none);
      await containerURL.delete(Aborter.none);
    }
  });

  it(`Should not work with invalid issuers @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://invalidissuer/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://invalidaccount.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(new TokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

    try {
      await containerURL.create(Aborter.none);
      await containerURL.delete(Aborter.none);
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
      "https://devstoreaccount1.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(new TokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

    try {
      await containerURL.create(Aborter.none);
      await containerURL.delete(Aborter.none);
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
      "https://devstoreaccount1.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(new TokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

    try {
      await containerURL.create(Aborter.none);
      await containerURL.delete(Aborter.none);
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
      "https://devstoreaccount1.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(new TokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);

    try {
      await containerURL.getAccessPolicy(Aborter.none);
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("AuthorizationFailure"),
        true
      );
      await containerURL.delete(Aborter.none);
      return;
    }
    await containerURL.delete(Aborter.none);
    assert.fail();
  });

  it(`Should not work with set container ACL @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceURL = new ServiceURL(
      baseURL,
      StorageURL.newPipeline(new TokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);
    await containerURL.create(Aborter.none);

    try {
      await containerURL.setAccessPolicy(Aborter.none, "container");
    } catch (err) {
      assert.deepStrictEqual(
        err.message.includes("AuthorizationFailure"),
        true
      );
      await containerURL.delete(Aborter.none);
      return;
    }
    await containerURL.delete(Aborter.none);
    assert.fail();
  });

  it(`Should not work with HTTP @loki @sql`, async () => {
    await server.close();
    await server.clean();

    server = factory.createServer(false, false, false, "basic");
    await server.start();

    const httpBaseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;

    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.blob.core.windows.net",
      "user_impersonation"
    );

    const serviceURL = new ServiceURL(
      httpBaseURL,
      StorageURL.newPipeline(new TokenCredential(token), {
        retryOptions: { maxTries: 1 }
      })
    );

    const containerName: string = getUniqueName("1container-with-dash");
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);

    try {
      await containerURL.create(Aborter.none);
      await containerURL.delete(Aborter.none);
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
