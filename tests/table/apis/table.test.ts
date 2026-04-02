import * as assert from "assert";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import {
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  restoreBuildRequestOptions
} from "../../testutils";
import {
  HOST,
  PROTOCOL,
  PORT,
  createConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";
import { TableClient, TableServiceClient } from "@azure/data-tables";
import type { FullOperationResponse } from "@azure/core-client";
import {
  HeaderConstants,
  TABLE_API_VERSION
} from "../../../src/table/utils/constants";

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
  const tableService = TableServiceClient.fromConnectionString(
    createConnectionStringForTest(testLocalAzuriteInstance),
    { allowInsecureConnection: true }
  );

  before(async () => {
    server = createTableServerForTest();
    await server.start();
  });

  after(async () => {
    restoreBuildRequestOptions(tableService);
    await server.close();
  });

  it("createTable, prefer=return-no-content, accept=application/json;odata=minimalmetadata @loki", async () => {
    const tableName: string = getUniqueName("table");
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    const headers = {
      Prefer: "return-no-content",
      accept: "application/json;odata=minimalmetadata"
    };

    await tableService.createTable(tableName, {
      requestOptions: { customHeaders: headers }
    });
  });

  it("createTable, prefer=return-content, accept=application/json;odata=fullmetadata @loki", async () => {
    const tableName: string = getUniqueName("table");
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    const headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };

    let response: FullOperationResponse | undefined;
    await tableService.createTable(tableName, {
      requestOptions: { customHeaders: headers },
      onResponse: (rawResponse) => (response = rawResponse)
    });

    const bodies = response?.parsedBody;
    assert.deepStrictEqual(bodies.name, tableName);
    assert.deepStrictEqual(bodies.odataType, `${EMULATOR_ACCOUNT_NAME}.Tables`);
    assert.deepStrictEqual(
      bodies.odataMetadata,
      `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/$metadata#Tables/@Element`
    );
    assert.deepStrictEqual(
      bodies.odataId,
      `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/Tables('${tableName}')`
    );
    assert.deepStrictEqual(bodies.odataEditLink, `Tables('${tableName}')`);
  });

  it("createTable, prefer=return-content, accept=application/json;odata=minimalmetadata @loki", (done) => {
    // TODO
    done();
  });

  it("createTable, prefer=return-content, accept=application/json;odata=nometadata @loki", (done) => {
    // TODO
    done();
  });

  it("queryTable, accept=application/json;odata=fullmetadata @loki", async () => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    const headers = {
      accept: "application/json;odata=fullmetadata"
    };

    let response: FullOperationResponse | undefined;
    await tableService
      .listTables({
        requestOptions: { customHeaders: headers },
        onResponse: (rawResponse) => (response = rawResponse)
      })
      .next();

    assert.strictEqual(response?.parsedHeaders?.version, TABLE_API_VERSION);
    const bodies = response?.parsedBody;
    assert.deepStrictEqual(
      bodies.odataMetadata,
      `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/$metadata#Tables`
    );
    assert.ok(bodies.value[0].name);
    assert.ok(bodies.value[0].odataType);
    assert.ok(bodies.value[0].odataId);
    assert.ok(bodies.value[0].odataEditLink);
  });

  it("queryTable, accept=application/json;odata=minimalmetadata @loki", async () => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    const headers = {
      accept: "application/json;odata=minimalmetadata"
    };
    let response: FullOperationResponse | undefined;
    await tableService
      .listTables({
        requestOptions: { customHeaders: headers },
        onResponse: (rawResponse) => (response = rawResponse)
      })
      .next();

    assert.strictEqual(response?.parsedHeaders?.version, TABLE_API_VERSION);
    const bodies = response?.parsedBody;
    assert.deepStrictEqual(
      bodies.odataMetadata,
      `${PROTOCOL}://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}/$metadata#Tables`
    );
    assert.ok(bodies.value[0].name);
  });

  it("queryTable, accept=application/json;odata=nometadata @loki", async () => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    const headers = {
      accept: "application/json;odata=nometadata"
    };
    let response: FullOperationResponse | undefined;
    await tableService
      .listTables({
        requestOptions: { customHeaders: headers },
        onResponse: (rawResponse) => (response = rawResponse)
      })
      .next();

    assert.strictEqual(response?.parsedHeaders?.version, TABLE_API_VERSION);
    const bodies = response?.parsedBody;
    assert.ok(bodies.value[0].name);
  });

  it("deleteTable that exists, @loki", async () => {
    /*
    https://docs.microsoft.com/en-us/rest/api/storageservices/delete-table
    */
    const tableToDelete = getUniqueName("table") + "del";

    await tableService.createTable(tableToDelete);
    await tableService.deleteTable(tableToDelete);
  });

  it("deleteTable that does not exist, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-table

    const tableToDelete = getUniqueName("table") + "causeerror";

    await tableService.deleteTable(tableToDelete);
  });

  it("createTable with invalid version, @loki", async () => {
    const headers = { [HeaderConstants.X_MS_VERSION]: "invalid" };

    try {
      await tableService.createTable("test", {
        requestOptions: { customHeaders: headers }
      });
      assert.fail("created table with invalid version");
    } catch (_) {
      /* Test success */
    }
  });

  it("Should have a valid OData Metadata value when inserting a table, @loki", async () => {
    const headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const newTableName: string = getUniqueName("table");
    let response: FullOperationResponse | undefined;
    await tableService.createTable(newTableName, {
      requestOptions: { customHeaders: headers },
      onResponse: (rawResponse) => (response = rawResponse)
    });

    assert.strictEqual(response?.parsedHeaders?.version, TABLE_API_VERSION);
    const body = response?.parsedBody;
    const meta: string = body.odataMetadata;
    // service response for this operation ends with /@Element
    assert.strictEqual(meta.endsWith("/@Element"), true);
  });

  it("SetAccessPolicy should work @loki", async () => {
    const tableAcl = [
      {
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=",
        accessPolicy: {
          permission: "raud",
          expiry: new Date("2018-12-31T11:22:33.000Z"),
          start: new Date("2017-12-31T11:22:33.000Z")
        }
      },
      {
        id: "policy2",
        accessPolicy: {
          permission: "a",
          expiry: new Date("2030-11-31T11:22:33.000Z"),
          start: new Date("2017-12-31T11:22:33.000Z")
        }
      }
    ];
    const aclTableName: string = getUniqueName("table") + "setAcl";
    await tableService.createTable(aclTableName);

    // a random id used to test whether response returns the client id sent in request
    const setClientRequestId = "b86e2b01-a7b5-4df2-b190-205a0c24bd36";
    const tableClient = TableClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      aclTableName,
      { allowInsecureConnection: true }
    );
    const setResult = await tableClient.setAccessPolicy(tableAcl, {
      requestOptions: {
        customHeaders: { "x-ms-client-request-id": setClientRequestId }
      }
    });

    assert.strictEqual(setResult.clientRequestId, setClientRequestId);

    let response: FullOperationResponse | undefined;
    const getResult = await tableClient.getAccessPolicy({
      requestOptions: {
        customHeaders: { "x-ms-client-request-id": setClientRequestId }
      },
      onResponse: (rawResponse) => (response = rawResponse)
    });
    assert.strictEqual(
      response?.parsedBody.clientRequestId,
      setClientRequestId
    );
    assert.deepStrictEqual(getResult, tableAcl);
  });

  it("setAccessPolicy negative @loki", async () => {
    const tableAcl = [
      {
        id: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=",
        permission: "rwdl",
        expiry: new Date("2018-12-31T11:22:33.4567890Z"),
        start: new Date("2017-12-31T11:22:33.4567890Z")
      },
      {
        id: "policy2",
        permission: "a",
        expiry: new Date("2030-11-31T11:22:33.4567890Z"),
        start: new Date("2017-12-31T11:22:33.4567890Z")
      }
    ];

    const tableName = getUniqueName("setACLNeg");
    await tableService.createTable(tableName);

    const tableClient = TableClient.fromConnectionString(
      createConnectionStringForTest(testLocalAzuriteInstance),
      tableName,
      { allowInsecureConnection: true }
    );
    try {
      await tableClient.setAccessPolicy(tableAcl);
      assert.fail("invalid acl set");
    } catch (e) {
      /* test success */
    }
  });

  it("should respond to get table properties @loki", async () => {
    const tableName = getUniqueName("getProperties");
    await tableService.createTable(tableName);

    const props = await tableService.getProperties();

    assert.strictEqual(
      props.logging?.version,
      "1.0",
      `value "${props.logging?.version}" is not the expected MetaData for Logging Version`
    );
  });

  it("should delete a table using case-insensitive logic, @loki", async () => {
    const tableName = getUniqueName("caseInsensitive");
    await tableService.createTable(tableName);
    await tableService.deleteTable(tableName.toUpperCase());
  });

  it("should preserve casing on table names, @loki", async () => {
    const tableName = getUniqueName("myTable");
    await tableService.createTable(tableName);

    const tables = await tableService
      .listTables({ queryOptions: { filter: `TableName eq '${tableName}'` } })
      .next();
    assert.strictEqual(tables.value.name, tableName);
  });

  // https://github.com/Azure/Azurite/issues/1726
  it("should not accidentally delete the wrong similarly named table, @loki", async () => {
    const testTablePrefix = "deleteTest";
    const tableName = getUniqueName(testTablePrefix);
    await tableService.createTable(tableName);
    let validResult = false;
    const result = await tableService.listTables().byPage().next();
    // look for tableName in the result.entries[]
    for (const entry of result.value) {
      if (entry.name === tableName) {
        validResult = true;
      }
    }
    if (!validResult) {
          console.log("We did not find the expected table!");

      assert.strictEqual(
        validResult,
        true,
        "We did not find the expected table!"
      );
    }

    // now create a second table with a similar name
    const tableName2 = getUniqueName(testTablePrefix);
    tableService.createTable(tableName2);

    const newResult =  await tableService.listTables().byPage().next();
    validResult = false;
    for (const entry of newResult.value) {
      if (entry.name === tableName2) {
        validResult = true;
      }
    }
    if (!validResult) {
      assert.strictEqual(
        validResult,
        true,
        "We did not find the expected table!"
      );
    }
    // now delete the first table and check that the correct table was deleted
    await tableService.deleteTable(tableName);
    const resultAfterDelete = await tableService.listTables().byPage().next();
    validResult = false;
    for (const entry of resultAfterDelete.value) {
      if (entry.name === tableName) {
        validResult = true;
      }
    }
    if (validResult) {
      assert.strictEqual(
        validResult,
        false,
        "We found the table that should have been deleted!"
      );
    }
  });
});
