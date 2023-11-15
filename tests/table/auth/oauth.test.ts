import { AzureNamedKeyCredential, AzureSASCredential, generateTableSas, TableClient } from "@azure/data-tables";

import * as assert from "assert";

import { configLogger } from "../../../src/common/Logger";
import TableTestServerFactory from "../utils/TableTestServerFactory";
import { EMULATOR_ACCOUNT_KEY, generateJWTToken, getUniqueName } from "../../testutils";
import { SimpleTokenCredential } from "../../simpleTokenCredential";
import { AccountSASPermissions, AccountSASResourceTypes, AccountSASServices, generateAccountSASQueryParameters, SASProtocol, StorageSharedKeyCredential } from "@azure/storage-blob";

// Set true to enable debug log
configLogger(false);

describe("Table OAuth Basic", () => {
  const factory = new TableTestServerFactory();
  let server = factory.createServer({
    metadataDBPath: "__test_db_table__.json",
    enableDebugLog: false,
    debugLogFilePath: "debug-test-table.log",
    loose: false,
    skipApiVersionCheck: false,
    https: true,
    oauth: "basic"
  });
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
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
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
        "user_impersonation",
        "23657296-5cd5-45b0-a809-d972a7f4dfe1",
        "dd0d0df1-06c3-436c-8034-4b9a153097ce"
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
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
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
        "user_impersonation",
        "23657296-5cd5-45b0-a809-d972a7f4dfe1",
        "dd0d0df1-06c3-436c-8034-4b9a153097ce"
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
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
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
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
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
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
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
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
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
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
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

    server = factory.createServer({
      metadataDBPath: "__test_db_table__.json",
      enableDebugLog: false,
      debugLogFilePath: "debug-test-table.log",
      loose: false,
      skipApiVersionCheck: false,
      https: false,
      oauth: "basic"
    });
    await server.start();

    const httpBaseURL = `http://${server.config.host}:${server.config.port}/devstoreaccount1`;

    const token = generateJWTToken(
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      new Date("2019/01/01"),
      "https://sts.windows-ppe.net/ab1f708d-50f6-404c-a006-d71b2ac7a606/",
      "https://devstoreaccount1.table.core.windows.net",
      "user_impersonation",
      "23657296-5cd5-45b0-a809-d972a7f4dfe1",
      "dd0d0df1-06c3-436c-8034-4b9a153097ce"
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

  it("Create Table with not exist Account, return 404 @loki @sql", async () => {
    const accountNameNotExist = "devstoreaccountnotexist";
    const baseURL = `https://${server.config.host}:${server.config.port}/${accountNameNotExist}`;
    const tableName: string = getUniqueName("table");

    // Shared key
    const sharedKeyCredential = new AzureNamedKeyCredential(
      accountNameNotExist,
      EMULATOR_ACCOUNT_KEY
    );
    let tableClient = new TableClient(
      baseURL,
      tableName,
      sharedKeyCredential
    ); 
    try {
      await tableClient.createTable();
    } catch (err) {
      if (err.statusCode !== 404 || err.response.parsedBody.Code !== 'ResourceNotFound'){
        assert.fail( "Create Table with shared key not fail as expected." + err.toString()); 
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
    tableClient = new TableClient(
      baseURL,
      tableName,
      new SimpleTokenCredential(token),
      {
        redirectOptions: { maxRetries: 1 }
      }
    );
    try {
      await tableClient.createTable();
    } catch (err) {
      if (err.statusCode !== 404 || err.response.parsedBody.Code !== 'ResourceNotFound'){
        assert.fail( "Create Table with oauth not fail as expected." + err.toString()); 
      }
    }

    // Account SAS
    const now = new Date();
    now.setMinutes(now.getMinutes() - 5); 
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    let sas = generateAccountSASQueryParameters(
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
      new StorageSharedKeyCredential(
        accountNameNotExist,
        EMULATOR_ACCOUNT_KEY
      )
    ).toString();
    tableClient = new TableClient(
      baseURL,
      tableName,
      new AzureSASCredential(sas)
    );
    try {
      await tableClient.createTable();
    } catch (err) {
      if (err.statusCode !== 404 || err.response.parsedBody.Code !== 'ResourceNotFound'){
        assert.fail( "Create Table with account sas not fail as expected." + err.toString()); 
      }
    }

    // Service SAS
    sas = generateTableSas(
      tableName,
      sharedKeyCredential,
    ).toString();
    tableClient = new TableClient(
      baseURL,
      tableName,
      new AzureSASCredential(sas)
    ); 
    try {
      await tableClient.createTable();
    } catch (err) {
      if (err.statusCode !== 404 || err.response.parsedBody.Code !== 'ResourceNotFound'){
        assert.fail( "Create Table with service sas not fail as expected." + err.toString()); 
      }
    }
  });
});
