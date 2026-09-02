import { strict as assert } from "assert";
import { TableServiceClient } from "@azure/data-tables";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import {
  HeaderConstants,
  TABLE_API_VERSION
} from "../../../src/table/utils/constants";
import { EMULATOR_ACCOUNT_NAME, getUniqueName } from "../../testutils";
import {
  HOST,
  PROTOCOL,
  PORT,
  createConnectionStringForTest,
  createTableServerForTest,
  createHttpClientForTest
} from "../utils/table.entity.test.utils";

// Set true to enable debug log
configLogger(false);

// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

describe("table APIs test", () => {
  let server: TableServer;

  before(async () => {
    server = createTableServerForTest();
    await server.start();
  });

  after(async () => {
    await server.close();
  });

  it("createTable, prefer=return-no-content, accept=application/json;odata=minimalmetadata @loki", async () => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    const requestHeaders = {
      Prefer: "return-no-content",
      Accept: "application/json;odata=minimalmetadata"
    };
    const tableName: string = getUniqueName("table");
    const capture: { headers?: any; body?: any; status?: number } = {};

    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest(requestHeaders, capture)
      }
    );

    await client.createTable(tableName);

    assert.strictEqual(capture.status, 204);
    assert.strictEqual(capture.headers?.["x-ms-version"], TABLE_API_VERSION);
    assert.deepStrictEqual(capture.body, "");
  });

  it("createTable, prefer=return-content, accept=application/json;odata=fullmetadata @loki", async () => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    const requestHeaders = {
      Prefer: "return-content",
      Accept: "application/json;odata=fullmetadata"
    };
    const tableName: string = getUniqueName("table");
    const capture: { headers?: any; body?: any; status?: number } = {};

    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest(requestHeaders, capture)
      }
    );

    await client.createTable(tableName);

    assert.strictEqual(capture.status, 201);
    assert.strictEqual(capture.headers?.["x-ms-version"], TABLE_API_VERSION);

    const body = capture.body as any;
    assert.deepStrictEqual(body.TableName, tableName);
    assert.deepStrictEqual(
      body["odata.type"],
      `${EMULATOR_ACCOUNT_NAME}.Tables`
    );
    assert.deepStrictEqual(
      body["odata.metadata"],
      `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/$metadata#Tables/@Element`
    );
    assert.deepStrictEqual(
      body["odata.id"],
      `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/Tables('${tableName}')`
    );
    assert.deepStrictEqual(body["odata.editLink"], `Tables('${tableName}')`);
  });

  it("createTable, prefer=return-content, accept=application/json;odata=minimalmetadata @loki", async () => {
    // TODO
  });

  it("createTable, prefer=return-content, accept=application/json;odata=nometadata @loki", async () => {
    // TODO
  });

  it("queryTable, accept=application/json;odata=fullmetadata @loki", async () => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    const tableName: string = getUniqueName("table");
    const capture: { headers?: any; body?: any; status?: number } = {};

    const requestHeaders = {
      Accept: "application/json;odata=fullmetadata"
    };

    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest(requestHeaders, capture)
      }
    );

    await client.createTable(tableName);

    const tables: any[] = [];

    for await (const page of client.listTables().byPage({ maxPageSize: 20 })) {
      for (const t of page) {
        tables.push(t);
      }
    }
    assert.ok(tables.length > 0);
    assert.strictEqual(capture.status, 200);
    assert.strictEqual(capture.headers?.["x-ms-version"], TABLE_API_VERSION);

    const body = capture.body as any;
    assert.deepStrictEqual(
      body["odata.metadata"],
      `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/$metadata#Tables`
    );
    assert.ok(body.value[0].TableName);
    assert.ok(body.value[0]["odata.type"]);
    assert.ok(body.value[0]["odata.id"]);
    assert.ok(body.value[0]["odata.editLink"]);
  });

  it("queryTable, accept=application/json;odata=minimalmetadata @loki", async () => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    const tableName: string = getUniqueName("table");
    const capture: { headers?: any; body?: any; status?: number } = {};

    const requestHeaders = {
      Accept: "application/json;odata=minimalmetadata"
    };

    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest(requestHeaders, capture)
      }
    );

    await client.createTable(tableName);

    const tables: any[] = [];

    for await (const t of client.listTables()) {
      tables.push(t);
    }
    assert.ok(tables.length > 0);
    assert.strictEqual(capture.status, 200);
    assert.strictEqual(capture.headers?.["x-ms-version"], TABLE_API_VERSION);

    const body = capture.body as any;
    assert.deepStrictEqual(
      body["odata.metadata"],
      `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/$metadata#Tables`
    );
    assert.ok(body.value[0].TableName);
  });

  it("queryTable, accept=application/json;odata=nometadata @loki", async () => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    const tableName: string = getUniqueName("table");
    const capture: { headers?: any; body?: any; status?: number } = {};
    const requestHeaders = {
      Accept: "application/json;odata=nometadata"
    };
    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest(requestHeaders, capture)
      }
    );

    await client.createTable(tableName);

    const tables: any[] = [];

    for await (const t of client.listTables()) {
      tables.push(t);
    }
    assert.ok(tables.length > 0);
    assert.strictEqual(capture.status, 200);
    assert.strictEqual(capture.headers?.["x-ms-version"], TABLE_API_VERSION);

    const body = capture.body as any;
    assert.ok(body.value[0].TableName);
    assert.deepStrictEqual(body["odata.metadata"], undefined);
  });

  it("deleteTable that exists, @loki", async () => {
    /*
    https://docs.microsoft.com/en-us/rest/api/storageservices/delete-table
    */
    const capture: { headers?: any; body?: any; status?: number } = {};
    const requestHeaders = {};
    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest(requestHeaders, capture)
      }
    );

    const tableToDelete = getUniqueName("table") + "del";

    await client.createTable(tableToDelete);
    await client.deleteTable(tableToDelete);

    // no body expected, we expect 204 no content on successful deletion
    assert.strictEqual(capture.status, 204);
  });

  it("deleteTable that does not exist, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-table
    const requestHeaders = {};
    const capture: { headers?: any; body?: any; status?: number } = {};
    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest(requestHeaders, capture)
      }
    );

    const tableToDelete = getUniqueName("table") + "causeerror";

    try {
      await client.deleteTable(tableToDelete);

      // no body expected, we expect 404
      assert.fail("Expected deleteTable to fail");
    } catch (error: any) {
      assert.strictEqual(capture.status, 404);
    }
  });

  it("createTable with invalid version, @loki", async () => {
    const capture: { headers?: any; body?: any; status?: number } = {};
    const requestHeaders = { [HeaderConstants.X_MS_VERSION]: "invalid" };
    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest(requestHeaders, capture)
      }
    );
    try {
      await client.createTable(getUniqueName("table") + "invalidversion");
      assert.fail("Expected createTable to fail with invalid version");
    } catch (error: any) {
      assert.strictEqual(error.statusCode, 400);
    }
  });

  it("Should have a valid OData Metadata value when inserting a table, @loki", async () => {
    const capture: { headers?: any; body?: any; status?: number } = {};
    const requestHeaders = {
      Prefer: "return-content",
      Accept: "application/json;odata=fullmetadata"
    };
    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest(requestHeaders, capture)
      }
    );
    const newTableName: string = getUniqueName("table");

    await client.createTable(newTableName);
    const body = capture.body as any;
    const meta: string = body["odata.metadata" as keyof object];
    assert.strictEqual(meta.endsWith("/@Element"), true);
  });

  it("should respond to get table properties @loki", async () => {
    const capture: { headers?: any; body?: any; status?: number } = {};
    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest({}, capture)
      }
    );
    const tableName = getUniqueName("getProperties");
    await client.createTable(tableName);
    const props = await client.getProperties();
    assert.ok(props != undefined);
    assert.strictEqual(
      props.logging?.version,
      "1.0",
      `value "${props.logging?.version}" is not the expected MetaData for Logging Version`
    );
  });

  it("should delete a table using case-insensitive logic, @loki", async () => {
    const capture: { headers?: any; body?: any; status?: number } = {};
    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest({}, capture)
      }
    );
    const tableName = getUniqueName("caseInsensitive");
    await client.createTable(tableName);
    await client.deleteTable(tableName.toUpperCase());
    assert.strictEqual(capture.status, 204);
  });

  it("should preserve casing on table names, @loki", async () => {
    const capture: { headers?: any; body?: any; status?: number } = {};
    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest({}, capture)
      }
    );
    const tableName = getUniqueName("casePreserve");
    await client.createTable(tableName);

    const names = await listAllTableNames(client, "casePreserve");

    assert.strictEqual(
      names.length > 0,
      true,
      "We did not find the expected table!"
    );

    assert.strictEqual(
      names.includes(tableName),
      true,
      "We did not find the expected table!"
    );
    assert.strictEqual(capture.status, 200);
  });

  // https://github.com/Azure/Azurite/issues/1726
  it("should not accidentally delete the wrong similarly named table, @loki", async () => {
    const capture: { headers?: any; body?: any; status?: number } = {};
    const client = TableServiceClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      {
        allowInsecureConnection: testLocalAzuriteInstance,
        httpClient: createHttpClientForTest({}, capture)
      }
    );
    const testTablePrefix = "deleteTest";
    const tableName = getUniqueName(testTablePrefix);
    await client.createTable(tableName);

    let names = await listAllTableNames(client, testTablePrefix);
    // look for tableName in the result.entries[]
    assert.strictEqual(
      names.includes(tableName),
      true,
      "We did not find the expected table!"
    );

    // now create a second table with a similar name
    const tableName2 = getUniqueName(testTablePrefix);
    await client.createTable(tableName2);

    names = await listAllTableNames(client, testTablePrefix);
    assert.strictEqual(
      names.includes(tableName2),
      true,
      "We did not find the expected second table!"
    );

    // now delete the first table and check that the correct table was deleted
    await client.deleteTable(tableName);

    names = await listAllTableNames(client, testTablePrefix);
    assert.strictEqual(
      names.includes(tableName),
      false,
      "We found the table that should have been deleted!"
    );
    assert.strictEqual(
      names.includes(tableName2),
      true,
      "The similarly named table should still exist!"
    );
  });
});

async function listAllTableNames(
  client: TableServiceClient,
  prefix?: string
): Promise<string[]> {
  const names: string[] = [];

  for await (const table of client.listTables()) {
    const name =
      (table as any).name ??
      (table as any).tableName ??
      (table as any).TableName;
    if (typeof name === "string") {
      if (!prefix || name.startsWith(prefix)) {
        names.push(name);
      }
    }
  }

  return names;
}
