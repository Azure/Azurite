import * as assert from "assert";
import { TableClient, AzureSASCredential } from "@azure/data-tables";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  createTableServerForTestOAuth,
  getBaseUrlForTest,
  generateTableSasToken,
  createConnectionStringForTest,
  generateTableServiceSasWithIdentifier
} from "../utils/table.entity.test.utils";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

describe("Shared Access Signature (SAS) authentication", () => {
  let server: TableServer;
  // this test file is using the older callback based SDK,
  // and so uses a clunkier table creation in each test.
  // This avoids us hanging when trying to close out the tests.
  before(async () => {
    server = createTableServerForTestOAuth();
    await server.start();
  });

  after(async () => {
    await server.close();
  });

  it("1. insertEntity with Query permission should not work @loki", async () => {
    // Use table name include upper case letter to validate SAS signature should calculate from lower case table name (Issue #1359)
    const tableName: string = getUniqueName("Sas1");

    // ✅ create table using normal client (non-SAS)
    const conn = createConnectionStringForTest(testLocalAzuriteInstance);
    const accountName = /AccountName=([^;]*)/.exec(conn)![1];
    const accountKey = /AccountKey=([^;]*)/.exec(conn)![1];

    const baseUrl = getBaseUrlForTest();
    // used to generate SAS
    const adminClient = TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: testLocalAzuriteInstance
    });

    await adminClient.createTable();

    // ✅ create SAS (ONLY 'r' permission)
    const expiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const sas = generateTableSasToken({
      accountName,
      accountKey,
      tableName,
      permissions: "r", // ✅ Query only
      expiry
    });
    const sasClient = new TableClient(
      baseUrl,
      tableName,

      new AzureSASCredential(sas),
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    const entity = {
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    };

    try {
      await sasClient.createEntity(entity);
      assert.fail("Expected authorization failure");
    } catch (error: any) {
      // ✅ assert failure behaviour
      assert.strictEqual(error.statusCode, 403);

      if (error.code) {
        assert.strictEqual(error.code, "AuthorizationPermissionMismatch");
      }
    }
  });

  it("2. insertEntity with Add permission should work @loki", async () => {
    const tableName: string = getUniqueName("sas2");

    const conn = createConnectionStringForTest(testLocalAzuriteInstance);
    const accountName = /AccountName=([^;]*)/.exec(conn)![1];
    const accountKey = /AccountKey=([^;]*)/.exec(conn)![1];
    const baseUrl = getBaseUrlForTest();

    // created table for tests
    const adminClient = TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: testLocalAzuriteInstance
    });

    await adminClient.createTable();

    // ✅ create SAS (ONLY 'a' permission)
    const expiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const sas = generateTableSasToken({
      accountName,
      accountKey,
      tableName,
      permissions: "a", // ✅ Add only
      expiry
    });

    const sasClient = new TableClient(
      baseUrl,
      tableName,
      new AzureSASCredential(sas),
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    const entity = {
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    };

    await sasClient.createEntity(entity);

    const stored = await adminClient.getEntity("part1", "row1");

    assert.strictEqual(stored.partitionKey, "part1");
    assert.strictEqual(stored.rowKey, "row1");
    assert.strictEqual(stored.myValue, "value1");
  });

  it("3. insertEntity Add permission should work @loki", async () => {
    const tableName: string = getUniqueName("sas3");

    const conn = createConnectionStringForTest(testLocalAzuriteInstance);
    const accountName = /AccountName=([^;]*)/.exec(conn)![1];
    const accountKey = /AccountKey=([^;]*)/.exec(conn)![1];
    const baseUrl = getBaseUrlForTest();

    // Admin client: create the table first
    const adminClient = TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: testLocalAzuriteInstance
    });

    await adminClient.createTable();

    // Match the old sasPeriod(-1, 5) behaviour:
    // start 1 minute in the past, expire in 5 minutes
    const now = Date.now();
    const startsOn = new Date(now - 1 * 60 * 1000).toISOString();
    const expiresOn = new Date(now + 5 * 60 * 1000).toISOString();

    // Use the table service SAS helper
    const sas = generateTableSasToken({
      accountName,
      accountKey,
      tableName,
      permissions: "a", // Add permission
      expiry: expiresOn,
      start: startsOn
    });

    const sasClient = new TableClient(
      baseUrl,
      tableName,
      new AzureSASCredential(sas),
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    const entity = {
      partitionKey: "part1",
      rowKey: "row2",
      myValue: "value2"
    };

    // Success path: no exception expected
    await sasClient.createEntity(entity);

    const stored = await adminClient.getEntity("part1", "row2");

    assert.strictEqual(stored.partitionKey, "part1");
    assert.strictEqual(stored.rowKey, "row2");
    assert.strictEqual(stored.myValue, "value2");
  });

  it("4. insertEntity expired Add permission should not work @loki", async () => {
    const tableName: string = getUniqueName("sas4");

    const conn = createConnectionStringForTest(testLocalAzuriteInstance);
    const accountName = /AccountName=([^;]*)/.exec(conn)![1];
    const accountKey = /AccountKey=([^;]*)/.exec(conn)![1];
    const baseUrl = getBaseUrlForTest();

    // ✅ create table
    const adminClient = TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: testLocalAzuriteInstance
    });

    await adminClient.createTable();

    // ✅ expired SAS window (matches sasPeriod(-10, -5))
    const now = Date.now();
    const start = new Date(now - 10 * 60 * 1000).toISOString(); // 10 min ago
    const expiry = new Date(now - 5 * 60 * 1000).toISOString(); // 5 min ago (expired)

    const sas = generateTableSasToken({
      accountName,
      accountKey,
      tableName,
      permissions: "a",
      start,
      expiry
    });

    const sasClient = new TableClient(
      baseUrl,
      tableName,
      new AzureSASCredential(sas),
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    const entity = {
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    };

    try {
      await sasClient.createEntity(entity);
      assert.fail("Expected expired SAS to fail");
    } catch (error: any) {
      assert.strictEqual(
        error.statusCode,
        403,
        `Expected 403 but got: ${error?.statusCode} / ${error?.message}`
      );
    }

    // ✅ optional strong validation: ensure entity was NOT created
    try {
      await adminClient.getEntity("part1", "row1");
      assert.fail("Entity should not have been created with expired SAS");
    } catch {
      // expected: not found
    }
  });

  it("5. deleteEntity with Delete permission should work @loki", async () => {
    const tableName: string = getUniqueName("sas5");

    const conn = createConnectionStringForTest(testLocalAzuriteInstance);
    const accountName = /AccountName=([^;]*)/.exec(conn)![1];
    const accountKey = /AccountKey=([^;]*)/.exec(conn)![1];
    const baseUrl = getBaseUrlForTest();

    const adminClient = TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: testLocalAzuriteInstance
    });

    await adminClient.createTable();

    // Seed the entity with admin credentials
    await adminClient.createEntity({
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    });

    const now = Date.now();
    const start = new Date(now).toISOString();
    const expiry = new Date(now + 5 * 60 * 1000).toISOString();

    const sas = generateTableSasToken({
      accountName,
      accountKey,
      tableName,
      permissions: "d",
      start,
      expiry
    });

    const sasClient = new TableClient(
      baseUrl,
      tableName,
      new AzureSASCredential(sas),
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    await sasClient.deleteEntity("part1", "row1");

    // Verify it was actually deleted
    try {
      await adminClient.getEntity("part1", "row1");
      assert.fail("Entity should have been deleted");
    } catch {
      // expected
    }
  });

  it("6. deleteEntity with Add permission should not work @loki", async () => {
    const tableName: string = getUniqueName("sas6");

    const conn = createConnectionStringForTest(testLocalAzuriteInstance);
    const accountName = /AccountName=([^;]*)/.exec(conn)![1];
    const accountKey = /AccountKey=([^;]*)/.exec(conn)![1];
    const baseUrl = getBaseUrlForTest();

    const adminClient = TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: testLocalAzuriteInstance
    });

    await adminClient.createTable();

    // Seed the entity so this test is explicitly about delete permission
    await adminClient.createEntity({
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    });

    const now = Date.now();
    const start = new Date(now).toISOString();
    const expiry = new Date(now + 5 * 60 * 1000).toISOString();

    const sas = generateTableSasToken({
      accountName,
      accountKey,
      tableName,
      permissions: "a",
      start,
      expiry
    });

    const sasClient = new TableClient(
      baseUrl,
      tableName,
      new AzureSASCredential(sas),
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    try {
      await sasClient.deleteEntity("part1", "row1");
      assert.fail("Expected deleteEntity with Add-only SAS to fail");
    } catch (error: any) {
      assert.strictEqual(
        error.statusCode,
        403,
        `Expected 403 but got: ${error?.statusCode} / ${error?.message}`
      );
    }

    // Make sure the entity still exists
    const stored = await adminClient.getEntity("part1", "row1");
    assert.strictEqual(stored.partitionKey, "part1");
    assert.strictEqual(stored.rowKey, "row1");
  });

  it("7. Update an Entity that exists, @loki", async () => {
    const tableName: string = getUniqueName("sas7");

    const conn = createConnectionStringForTest(testLocalAzuriteInstance);
    const accountName = /AccountName=([^;]*)/.exec(conn)![1];
    const accountKey = /AccountKey=([^;]*)/.exec(conn)![1];
    const baseUrl = getBaseUrlForTest();

    const adminClient = TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: testLocalAzuriteInstance
    });

    await adminClient.createTable();

    const now = Date.now();
    const start = new Date(now).toISOString();
    const expiry = new Date(now + 5 * 60 * 1000).toISOString();

    // Need Add + Update, matching the old intent
    const sas = generateTableSasToken({
      accountName,
      accountKey,
      tableName,
      permissions: "au",
      start,
      expiry
    });

    const sasClient = new TableClient(
      baseUrl,
      tableName,
      new AzureSASCredential(sas),
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    await sasClient.createEntity({
      partitionKey: "part1",
      rowKey: "row3",
      myValue: "oldValue"
    });

    await sasClient.updateEntity(
      {
        partitionKey: "part1",
        rowKey: "row3",
        myValue: "newValue"
      },
      "Replace"
    );

    const stored = await adminClient.getEntity("part1", "row3");
    assert.strictEqual(stored.myValue, "newValue");
  });

  it("8. Update an Entity without update permission, @loki", async () => {
    const tableName: string = getUniqueName("sas8");

    const conn = createConnectionStringForTest(testLocalAzuriteInstance);
    const accountName = /AccountName=([^;]*)/.exec(conn)![1];
    const accountKey = /AccountKey=([^;]*)/.exec(conn)![1];
    const baseUrl = getBaseUrlForTest();

    const adminClient = TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: testLocalAzuriteInstance
    });

    await adminClient.createTable();

    // Seed the entity so the test is clearly about missing update permission
    await adminClient.createEntity({
      partitionKey: "part1",
      rowKey: "row4",
      myValue: "oldValue"
    });

    const now = Date.now();
    const start = new Date(now).toISOString();
    const expiry = new Date(now + 5 * 60 * 1000).toISOString();

    const sas = generateTableSasToken({
      accountName,
      accountKey,
      tableName,
      permissions: "a", // Add only, no update
      start,
      expiry
    });

    const sasClient = new TableClient(
      baseUrl,
      tableName,
      new AzureSASCredential(sas),
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    try {
      await sasClient.updateEntity(
        {
          partitionKey: "part1",
          rowKey: "row4",
          myValue: "newValue"
        },
        "Replace"
      );
      assert.fail("Expected updateEntity without update permission to fail");
    } catch (error: any) {
      assert.strictEqual(
        error.statusCode,
        403,
        `Expected 403 but got: ${error?.statusCode} / ${error?.message}`
      );
    }

    // Verify the original value is unchanged
    const stored = await adminClient.getEntity("part1", "row4");
    assert.strictEqual(stored.myValue, "oldValue");
  });

  it("9. Operation using SAS should fail if ACL generating the SAS no longer allow the operation, @loki", async () => {
    const tableName: string = getUniqueName("sas9");

    const conn = createConnectionStringForTest(testLocalAzuriteInstance);
    const accountName = /AccountName=([^;]*)/.exec(conn)![1];
    const accountKey = /AccountKey=([^;]*)/.exec(conn)![1];
    const baseUrl = getBaseUrlForTest();

    const adminClient = TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: testLocalAzuriteInstance
    });

    await adminClient.createTable();

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 1);

    const startsOn = new Date("2017-12-31T11:22:33.4567890Z");

    // Initial ACL allows read/add/update/delete
    await adminClient.setAccessPolicy([
      {
        id: "someacl",
        accessPolicy: {
          permission: "raud",
          start: startsOn,
          expiry: expiry
        }
      }
    ]);

    const sas = generateTableServiceSasWithIdentifier({
      accountName,
      accountKey,
      tableName,
      identifier: "someacl"
    });

    const sasClient = new TableClient(
      baseUrl,
      tableName,
      new AzureSASCredential(sas),
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    // First insert should succeed
    await sasClient.createEntity({
      partitionKey: "part1",
      rowKey: "row1",
      myValue: "value1"
    });

    // Change ACL with the SAME id so Add is no longer allowed
    await adminClient.setAccessPolicy([
      {
        id: "someacl",
        accessPolicy: {
          permission: "r",
          start: startsOn,
          expiry: expiry
        }
      }
    ]);

    // Same SAS should now fail because the referenced ACL no longer allows Add
    try {
      await sasClient.createEntity({
        partitionKey: "part2",
        rowKey: "row2",
        myValue: "value2"
      });

      assert.fail(
        "Expected createEntity to fail after ACL policy was changed to remove Add permission"
      );
    } catch (error: any) {
      assert.strictEqual(
        error.statusCode,
        403,
        `Expected 403 but got: ${error?.statusCode} / ${error?.message}`
      );
    }

    // Optional strong validation: second entity should not exist
    try {
      await adminClient.getEntity("part2", "row2");
      assert.fail("Second entity should not have been created");
    } catch {
      // expected
    }
  });

  it("10. Upsert succeeds with Update permission, @loki", async () => {
    const tableName: string = getUniqueName("sas10");

    const conn = createConnectionStringForTest(testLocalAzuriteInstance);
    const accountName = /AccountName=([^;]*)/.exec(conn)![1];
    const accountKey = /AccountKey=([^;]*)/.exec(conn)![1];
    const baseUrl = getBaseUrlForTest();

    const adminClient = TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: testLocalAzuriteInstance
    });

    await adminClient.createTable();

    const now = Date.now();
    const start = new Date(now).toISOString();
    const expiry = new Date(now + 5 * 60 * 1000).toISOString();

    const sas = generateTableSasToken({
      accountName,
      accountKey,
      tableName,
      permissions: "u",
      start,
      expiry
    });

    const sasClient = new TableClient(
      baseUrl,
      tableName,
      new AzureSASCredential(sas),
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    await sasClient.upsertEntity(
      {
        partitionKey: "part1",
        rowKey: "row4",
        myValue: "newValue"
      },
      "Replace"
    );

    // validate that the entity now exists
    const stored = await adminClient.getEntity("part1", "row4");

    assert.strictEqual(stored.partitionKey, "part1");
    assert.strictEqual(stored.rowKey, "row4");
    assert.strictEqual(stored.myValue, "newValue");
  });

  it("11. Upsert entity with Add + Update permission should work @loki", async () => {
    const tableName: string = getUniqueName("sas11");

    const conn = createConnectionStringForTest(testLocalAzuriteInstance);
    const accountName = /AccountName=([^;]*)/.exec(conn)![1];
    const accountKey = /AccountKey=([^;]*)/.exec(conn)![1];
    const baseUrl = getBaseUrlForTest();

    const adminClient = TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: testLocalAzuriteInstance
    });

    await adminClient.createTable();

    const now = Date.now();
    const start = new Date(now).toISOString();
    const expiry = new Date(now + 5 * 60 * 1000).toISOString();

    // ✅ Correct permission combination for upsert
    const sas = generateTableSasToken({
      accountName,
      accountKey,
      tableName,
      permissions: "au",
      start,
      expiry
    });

    const sasClient = new TableClient(
      baseUrl,
      tableName,
      new AzureSASCredential(sas),
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    // ✅ Case 1: entity does not exist → should CREATE
    await sasClient.upsertEntity(
      {
        partitionKey: "part1",
        rowKey: "row5",
        myValue: "value1"
      },
      "Replace"
    );

    let stored = await adminClient.getEntity("part1", "row5");
    assert.strictEqual(stored.myValue, "value1");

    // ✅ Case 2: entity exists → should UPDATE
    await sasClient.upsertEntity(
      {
        partitionKey: "part1",
        rowKey: "row5",
        myValue: "value2"
      },
      "Replace"
    );

    stored = await adminClient.getEntity("part1", "row5");
    assert.strictEqual(stored.myValue, "value2");
  });
});
