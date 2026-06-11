import { strict as assert } from "assert";
import { TableServiceClient } from "@azure/data-tables";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import {
  createConnectionStringForTest,
  createSecondaryConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";
import { getServicePropertiesForTest } from "../utils/table.service.test.properties";

import * as http from "http";

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
  let tableService: TableServiceClient;

  before(async () => {
    server = createTableServerForTest();
    await server.start();

    const conn = createConnectionStringForTest(testLocalAzuriteInstance);

    tableService = TableServiceClient.fromConnectionString(conn, {
      allowInsecureConnection: testLocalAzuriteInstance,
      agent: new http.Agent({ keepAlive: true })
    });
  });

  after(async () => {
    await server.close();
  });

  it("GetServiceProperties @loki", async () => {
    const result = await tableService.getProperties();
    // Current test, there are no CORS rules, but once we implement setProperties, we can add cors rules
    // these have been validated against the service instead
    if (result.cors && result.cors.length > 0) {
      assert.ok(result.cors[0].allowedHeaders.length >= 0);
      assert.ok(result.cors[0].allowedMethods.length > 0);
      assert.ok(result.cors[0].allowedOrigins.length > 0);
      assert.ok(result.cors[0].exposedHeaders.length >= 0);
      assert.ok(result.cors[0].maxAgeInSeconds >= 0);
    } else {
      assert.ok(result !== undefined);
    }
  });

  it("GetServiceStats negative @loki", async () => {
    try {
      await tableService.getStatistics();
      assert.fail("Expected error");
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 400);
      assert.ok(err);
    }
  });

  it("SetServiceProperties @loki", async () => {
    const props = getServicePropertiesForTest();

    const setResponse = await tableService.setProperties(props);
    assert.ok(setResponse !== undefined);

    const result = await tableService.getProperties();

    if (result.cors && result.cors.length > 0) {
      assert.strictEqual(result.cors.length, 3);

      const rule = result.cors![0];

      assert.strictEqual(rule.allowedHeaders?.split(",").length, 3);
      assert.strictEqual(rule.allowedMethods?.split(",").length, 6);
      assert.strictEqual(rule.allowedOrigins?.split(",").length, 2);
      assert.strictEqual(rule.exposedHeaders?.split(",").length, 1);
      assert.strictEqual(rule.maxAgeInSeconds, 100);
    } else {
      assert.ok(result !== undefined);
    }
  });
});

describe("table APIs test - secondary location endpoint", () => {
  let server: TableServer;
  let tableService: TableServiceClient;

  before(async () => {
    server = createTableServerForTest();
    await server.start();

    const conn = createSecondaryConnectionStringForTest(
      testLocalAzuriteInstance
    );

    tableService = TableServiceClient.fromConnectionString(conn, {
      allowInsecureConnection: testLocalAzuriteInstance,
      agent: new http.Agent({ keepAlive: true })
    });
  });

  after(async () => {
    await server.close();
  });

  it("GetServiceStats @loki", async () => {
    const result = await tableService.getStatistics();
    assert.strictEqual(result.geoReplication?.status, "live");
  });
});
