// Tests in this file are using raw rest requests,
// as this enables us to test calls which are otherwise not possible
// using the SDKs, can be used as a test rig for repros which provide a debug log.
// later we can automate the parsing of repro logs to automatically play these into the tester
// special care is needed to replace etags and folders when used

import * as assert from "assert";
import { configLogger } from "../../../src/common/Logger";
import TableConfiguration from "../../../src/table/TableConfiguration";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import { postToAzurite } from "../utils/table.entity.tests.rest.submitter";

// Set true to enable debug log
configLogger(false);

describe("table name validation tests", () => {
  const host = "127.0.0.1";
  const port = 11002;
  const metadataDbPath = "__tableTestsStorage__";
  const enableDebugLog: boolean = true;
  const debugLogPath: string = "g:/debug.log";
  const config = new TableConfiguration(
    host,
    port,
    metadataDbPath,
    enableDebugLog,
    false,
    undefined,
    debugLogPath,
    false,
    true
  );

  let server: TableServer;

  let tableName: string = getUniqueName("flows");

  before(async () => {
    server = new TableServer(config);
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
    const tableName2 = tableName.substring(0, tableName.length - 4);
    const body2 = JSON.stringify({
      TableName: tableName2
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
    const tableName3 = tableName.substring(4);
    const body3 = JSON.stringify({
      TableName: tableName3
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
});
