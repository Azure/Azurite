import { TableClient } from "@azure/data-tables";

import * as assert from "assert";

import { configLogger } from "../../../src/common/Logger";
import TableTestServerFactory from "../utils/TableTestServerFactory";
import { generateJWTToken, getUniqueName } from "../../testutils";
import { SimpleTokenCredential } from "../../simpleTokenCredential";

// Set true to enable debug log
configLogger(false);

describe("Table OAuth Basic", () => {
  const factory = new TableTestServerFactory();
  let server = factory.createServer(false, false, true, "basic");
  const baseURL = `https://${server.config.host}:${server.config.port}/devstoreaccount1`;

  before(async () => {
    await server.start();
  });

  after(async () => {
    await server.close();
    await server.clean();
  });

  it(`Should work with create table @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://storage.azure.com",
      "user_impersonation"
    );

    const tableName: string = getUniqueName("tablewithdash");
    const tableClient = new TableClient(
      baseURL,
      tableName,
      new SimpleTokenCredential(token),
      {
        redirectOptions: { maxRetries: 1 }
      }
    );

    await tableClient.createTable();
    await tableClient.deleteTable();
  });

  it(`Should not work with invalid JWT token @loki @sql`, async () => {
    const tableName: string = getUniqueName("tablewithdash");
    const tableClient = new TableClient(
      baseURL,
      tableName,
      new SimpleTokenCredential("invalid token"),
      {
        redirectOptions: { maxRetries: 1 }
      }
    );

    try {
      await tableClient.createTable();
      await tableClient.deleteTable();
    } catch (err: any) {
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
      "https://devstoreaccount1.table.core.windows.net",
      "https://devstoreaccount1.table.core.windows.net/",
      "https://devstoreaccount1.table.core.chinacloudapi.cn",
      "https://devstoreaccount1.table.core.chinacloudapi.cn/",
      "https://devstoreaccount1.table.core.usgovcloudapi.net",
      "https://devstoreaccount1.table.core.usgovcloudapi.net/",
      "https://devstoreaccount1.table.core.cloudapi.de",
      "https://devstoreaccount1.table.core.cloudapi.de/"
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

      const tableName: string = getUniqueName("ltablewithdash");
      const tableClient = new TableClient(
        baseURL,
        tableName,
        new SimpleTokenCredential(token),
        {
          redirectOptions: { maxRetries: 1 }
        }
      );

      await tableClient.createTable();
      await tableClient.deleteTable();
    }
  });

  it(`Should not work with invalid audiences @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://invalidaccount.table.core.windows.net",
      "user_impersonation"
    );

    const tableName: string = getUniqueName("tablewithdash");
    const tableClient = new TableClient(
      baseURL,
      tableName,
      new SimpleTokenCredential(token),
      {
        redirectOptions: { maxRetries: 1 }
      }
    );

    try {
      await tableClient.createTable();
      await tableClient.deleteTable();
    } catch (err: any) {
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

      const tableName: string = getUniqueName("tablewithdash");
      const tableClient = new TableClient(
        baseURL,
        tableName,
        new SimpleTokenCredential(token),
        {
          redirectOptions: { maxRetries: 1 }
        }
      );

      await tableClient.createTable();
      await tableClient.deleteTable();
    }
  });

  it(`Should not work with invalid issuers @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://invalidissuer/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://invalidaccount.table.core.windows.net",
      "user_impersonation"
    );

    const tableName: string = getUniqueName("tablewithdash");
    const tableClient = new TableClient(
      baseURL,
      tableName,
      new SimpleTokenCredential(token),
      {
        redirectOptions: { maxRetries: 1 }
      }
    );

    try {
      await tableClient.createTable();
      await tableClient.deleteTable();
    } catch (err: any) {
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
      "https://devstoreaccount1.table.core.windows.net",
      "user_impersonation"
    );

    const tableName: string = getUniqueName("tablewithdash");
    const tableClient = new TableClient(
      baseURL,
      tableName,
      new SimpleTokenCredential(token),
      {
        redirectOptions: { maxRetries: 1 }
      }
    );

    try {
      await tableClient.createTable();
      await tableClient.deleteTable();
    } catch (err: any) {
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
      "https://devstoreaccount1.table.core.windows.net",
      "user_impersonation"
    );

    const tableName: string = getUniqueName("tablewithdash");
    const tableClient = new TableClient(
      baseURL,
      tableName,
      new SimpleTokenCredential(token),
      {
        redirectOptions: { maxRetries: 1 }
      }
    );

    try {
      await tableClient.createTable();
      await tableClient.deleteTable();
    } catch (err: any) {
      assert.deepStrictEqual(
        err.message.includes("AuthenticationFailed"),
        true
      );
      assert.deepStrictEqual(err.message.includes("expire"), true);
      return;
    }
    assert.fail();
  });

  it(`Should not work with get table ACL @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.table.core.windows.net",
      "user_impersonation"
    );

    const tableName: string = getUniqueName("tablewithdash");
    const tableClient = new TableClient(
      baseURL,
      tableName,
      new SimpleTokenCredential(token),
      {
        redirectOptions: { maxRetries: 1 }
      }
    );
    await tableClient.createTable();

    try {
      await tableClient.getAccessPolicy();
    } catch (err: any) {
      assert.deepStrictEqual(
        err.message.includes("AuthorizationFailure"),
        true
      );
      await tableClient.deleteTable();
      return;
    }
    await tableClient.deleteTable();
    assert.fail();
  });

  it(`Should not work with set table ACL @loki @sql`, async () => {
    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2100/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.table.core.windows.net",
      "user_impersonation"
    );

    const tableName: string = getUniqueName("tablewithdash");
    const tableClient = new TableClient(
      baseURL,
      tableName,
      new SimpleTokenCredential(token),
      {
        redirectOptions: { maxRetries: 1 }
      }
    );
    await tableClient.createTable();

    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); // Skip clock skew with server

    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);

    try {
      await tableClient.setAccessPolicy([
        {
          id: "test",
          accessPolicy: { start: now, expiry: tmr, permission: "r" }
        }
      ]);
    } catch (err: any) {
      assert.deepStrictEqual(
        err.message.includes("AuthorizationFailure"),
        true
      );
      await tableClient.deleteTable();
      return;
    }
    await tableClient.deleteTable();
    assert.fail();
  });

  // skip this test case for it will throw an error when use azure table sdk to connect Azurite table by http
  it.skip(`Should not work with HTTP @loki @sql`, async () => {
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
      "https://devstoreaccount1.table.core.windows.net",
      "user_impersonation"
    );

    const tableName: string = getUniqueName("tablewithdash");
    const tableClient = new TableClient(
      httpBaseURL,
      tableName,
      new SimpleTokenCredential(token),
      {
        redirectOptions: { maxRetries: 1 }
      }
    );

    try {
      await tableClient.createTable();
      await tableClient.deleteTable();
    } catch (err: any) {
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
