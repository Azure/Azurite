// Tests in this file are using raw rest requests,
// as this enables us to test calls which are otherwise not possible
// using the SDKs, can be used as a test rig for repros which provide a debug log.
// later we can automate the parsing of repro logs to automatically play these into the tester
// special care is needed to replace etags and folders when used
import * as assert from "assert";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import {  getUniqueName } from "../../testutils";
import {
  deleteToAzurite,
  getToAzurite,
  postToAzurite,
  postToAzuriteProductionUrl,
  getToAzuriteProductionUrl
} from "../utils/table.entity.tests.rest.submitter";
import dns = require("dns");
import TableTestServerFactory from "../utils/TableTestServerFactory";

// Set true to enable debug log
configLogger(false);

describe("table name validation tests", () => {
  const metadataDbPath = getUniqueName("__tableTestsStorage__");
  const enableDebugLog: boolean = true;
  const debugLogPath: string = "g:/debug.log";
  const productionStyleHostName = "devstoreaccount1.table.localhost"; // Use hosts file to make this resolve
  const productionStyleHostNameForSecondary = "devstoreaccount1-secondary.table.localhost";

  let server: TableServer;

  let tableName: string = getUniqueName("flows");

  before(async () => {
    server = new TableTestServerFactory().createServer({
      metadataDBPath: metadataDbPath,
      enableDebugLog: enableDebugLog,
      debugLogFilePath: debugLogPath,
      loose: false,
      skipApiVersionCheck: false,
      https: false
    });
    await server.start();
  });

  after(async () => {
    await server.close();
  });

  beforeEach(() => {
    // in order to run tests without cleaning up, I am replacing the table name with a unique name each time
    tableName = getUniqueName("table");
  });

  it("should not create a table with non alphanumeric characters, @loki", async () => {
    tableName = "this-should-not-work!";
    const body = JSON.stringify({
      TableName: tableName
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    try {
      await postToAzurite("Tables", body, createTableHeaders);
      assert.fail();
    } catch (err: any) {
      assert.strictEqual(
        err.response.status,
        400,
        `unexpected status code : ${err.response.status}`
      );
    }
  });

  it("should not create a table starting with a numeric character, @loki", async () => {
    tableName = "1" + getUniqueName("table");
    const body = JSON.stringify({
      TableName: tableName
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    try {
      await postToAzurite("Tables", body, createTableHeaders);
      assert.fail();
    } catch (err: any) {
      assert.strictEqual(
        err.response.status,
        400,
        `unexpected status code : ${err.response.status}`
      );
    }
  });

  it("should not create a table name longer than 63 chars, @loki", async () => {
    tableName = getUniqueName("table").padEnd(64, "a");
    const body = JSON.stringify({
      TableName: tableName
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    try {
      await postToAzurite("Tables", body, createTableHeaders);
      assert.fail();
    } catch (err: any) {
      assert.strictEqual(
        err.response.status,
        400,
        `unexpected status code : ${err.response.status}`
      );
    }
  });

  it("should not create a table name less than 3 chars, @loki", async () => {
    tableName = "ab";
    const body = JSON.stringify({
      TableName: tableName
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    try {
      await postToAzurite("Tables", body, createTableHeaders);
      assert.fail();
    } catch (err: any) {
      assert.strictEqual(
        err.response.status,
        400,
        `unexpected status code : ${err.response.status}`
      );
    }
  });

  it("should not create a table name called tables, @loki", async () => {
    tableName = "tables";
    const body = JSON.stringify({
      TableName: tableName
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    try {
      await postToAzurite("Tables", body, createTableHeaders);
      assert.fail();
    } catch (err: any) {
      assert.strictEqual(
        err.response.status,
        400,
        `unexpected status code : ${err.response.status}`
      );
    }
  });

  it("should not create a table differing only in case to another table, @loki", async () => {
    tableName = getUniqueName("table");
    const body = JSON.stringify({
      TableName: tableName
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    try {
      await postToAzurite("Tables", body, createTableHeaders);
    } catch (err: any) {
      assert.strictEqual(
        err.response.status,
        201,
        `unexpected status code : ${err.response.status}`
      );
    }
    const tableName2 = tableName.toUpperCase();
    const body2 = JSON.stringify({
      TableName: tableName2
    });
    try {
      await postToAzurite("Tables", body2, createTableHeaders);
      assert.fail();
    } catch (err: any) {
      assert.strictEqual(
        err.response.status,
        409,
        `unexpected status code : ${err.response.status}`
      );
    }
  });

  it("should create a table with a name which is a substring of an existing table, @loki", async () => {
    // this will be used for 3 table names
    // [ a + b ], [ a ], [ b ]
    const a = getUniqueName("t")
    const b = getUniqueName("t")
    tableName = a + b;
    const body1 = JSON.stringify({
      TableName: tableName
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };
    try {
      await postToAzurite("Tables", body1, createTableHeaders);
    } catch (err: any) {
      assert.strictEqual(
        err.response.status,
        201,
        `unexpected status code : ${err.response.status}`
      );
    }
    const body2 = JSON.stringify({
      TableName: a
    });
    try {
      await postToAzurite("Tables", body2, createTableHeaders);
    } catch (err: any) {
      assert.strictEqual(
        err,
        undefined,
        `unexpected exception with end trimmed! : ${err}`
      );
    }
    const body3 = JSON.stringify({
      TableName: b
    });
    try {
      await postToAzurite("Tables", body3, createTableHeaders);
    } catch (err: any) {
      assert.strictEqual(
        err,
        undefined,
        `unexpected exception with start trimmed! : ${err}`
      );
    }
  });

  it("should delete a table with a name which is a substring of an existing table, @loki", async () => {
    // this will be used for 4 table names
    // [ a ], [ a + b + c ], [ a + b ], [ b + c ]
    const a = getUniqueName("t")
    const b = getUniqueName("t")
    const c = getUniqueName("t")

    const body1 = JSON.stringify({
      TableName: a
    });
    const createTableHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json;odata=nometadata"
    };

    // get the table count before test
    const tableCountBeforeTest = (await getToAzurite("Tables", createTableHeaders)).data.value.length;

    // create table 1
    try {
      const createTable1 = await postToAzurite(
        "Tables",
        body1,
        createTableHeaders
      );
      assert.strictEqual(
        createTable1.status,
        201,
        "Did not have the expected number of tables before deletion"
      );
    } catch (err: any) {
      assert.strictEqual(
        err.response.status,
        201,
        `unexpected status code creating first table : ${err.response.status}`
      );
    }
    const body2 = JSON.stringify({
      TableName: a + b + c
    });
    // create table 2
    try {
      const createTable2 = await postToAzurite(
        "Tables",
        body2,
        createTableHeaders
      );
      assert.strictEqual(
        createTable2.status,
        201,
        "Did not have the expected number of tables before deletion"
      );
    } catch (err: any) {
      assert.strictEqual(
        err.response.status,
        201,
        `unexpected status code : ${err.response.status}`
      );
    }
    const body3 = JSON.stringify({
      TableName: a + b
    });
    // create table 3
    try {
      const createTable3 = await postToAzurite(
        "Tables",
        body3,
        createTableHeaders
      );
      assert.strictEqual(
        createTable3.status,
        201,
        "Did not have the expected number of tables before deletion"
      );
    } catch (err: any) {
      assert.strictEqual(
        err,
        undefined,
        `unexpected exception with end trimmed! : ${err}`
      );
    }
    const body4 = JSON.stringify({
      TableName: b + c
    });
    // create table 4
    try {
      const createTable4 = await postToAzurite(
        "Tables",
        body4,
        createTableHeaders
      );
      assert.strictEqual(
        createTable4.status,
        201,
        "Did not have the expected number of tables before deletion"
      );
    } catch (err: any) {
      assert.strictEqual(
        err,
        undefined,
        `unexpected exception with start trimmed! : ${err}`
      );
    }
    // now list tables before deletion...
    try {
      const listTableResult1 = await getToAzurite("Tables", createTableHeaders);
      // we count all tables created in the tests before this one as well
      assert.strictEqual(
        listTableResult1.data.value.length,
        tableCountBeforeTest + 4,
        "Did not have the expected number of tables before deletion"
      );
    } catch (err: any) {
      assert.strictEqual(
        err,
        undefined,
        `unexpected exception with start trimmed! : ${err}`
      );
    }
    // now delete "table"
    try {
      const deleteResult = await deleteToAzurite(
        `Tables('${a}')`,
        "",
        createTableHeaders
      );
      assert.strictEqual(
        deleteResult.status,
        204,
        "Delete was not successful."
      );
    } catch (err: any) {
      assert.strictEqual(
        err,
        undefined,
        `unexpected exception with start trimmed! : ${err}`
      );
    }
    // now list tables after deletion...
    try {
      const listTableResult2 = await getToAzurite("Tables", createTableHeaders);
      assert.strictEqual(
        listTableResult2.data.value.length,
        tableCountBeforeTest + 3,
        "Did not have the expected number of tables after deletion"
      );
      for (const table of listTableResult2.data.value) {
        assert.notStrictEqual(
          table.TableName,
          a,
          "We still list the table we should have deleted."
        );
      }
    } catch (err: any) {
      assert.strictEqual(
        err,
        undefined,
        `unexpected exception with start trimmed! : ${err}`
      );
    }
  });

  
  it(`Should work with production style URL when ${productionStyleHostName} is resolvable`, async () => {
    await dns.promises.lookup(productionStyleHostName).then(
      async (lookupAddress) => {
        let tableName = getUniqueName("table");
        const body = JSON.stringify({
          TableName: tableName
        });
        const createTableHeaders = {
          "Content-Type": "application/json",
          Accept: "application/json;odata=nometadata"
        };
        try {
          let response = await postToAzuriteProductionUrl(productionStyleHostName,"Tables", body, createTableHeaders);
          assert.strictEqual(response.status, 201);
        } catch (err: any) {
          assert.fail();
        }
      },
      () => {
        // Cannot perform this test. We need devstoreaccount1-secondary.blob.localhost to resolve to 127.0.0.1.
        // On Linux, this should just work,
        // On Windows, we can't spoof DNS record for specific process.
        // So we have options of running our own DNS server (overkill),
        // or editing hosts files (machine global operation; and requires running as admin).
        // So skip the test case.
        assert.ok(
          `Skipping test case - it needs ${productionStyleHostName} to be resolvable`
        );
      }
    );
  });

  it(`Should work with production style URL when ${productionStyleHostNameForSecondary} is resolvable`, async () => {
    await dns.promises.lookup(productionStyleHostNameForSecondary).then(
      async (lookupAddress) => {
        let tableName = getUniqueName("table");
        const body = JSON.stringify({
          TableName: tableName
        });
        const createTableHeaders = {
          "Content-Type": "application/json",
          Accept: "application/json;odata=nometadata"
        };
        try {
          let response = await postToAzuriteProductionUrl(productionStyleHostName,"Tables", body, createTableHeaders);
          assert.strictEqual(response.status, 201);
          let tablesList = await getToAzuriteProductionUrl(productionStyleHostNameForSecondary,"Tables", createTableHeaders);
          assert.strictEqual(tablesList.status, 200);
        } catch (err: any) {
          assert.fail();
        }
      },
      () => {
        // Cannot perform this test. We need devstoreaccount1-secondary.blob.localhost to resolve to 127.0.0.1.
        // On Linux, this should just work,
        // On Windows, we can't spoof DNS record for specific process.
        // So we have options of running our own DNS server (overkill),
        // or editing hosts files (machine global operation; and requires running as admin).
        // So skip the test case.
        assert.ok(
          `Skipping test case - it needs ${productionStyleHostNameForSecondary} to be resolvable`
        );
      }
    );
  });
});
