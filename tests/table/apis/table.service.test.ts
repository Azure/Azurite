import * as assert from "assert";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { restoreBuildRequestOptions } from "../../testutils";
import {
  createConnectionStringForTest,
  createSecondaryConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";
import { getServicePropertiesForTest } from "../utils/table.service.test.properties";
import { TableServiceClient } from "@azure/data-tables";

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

  it("GetServiceProperties @loki", async () => {
    const result = await tableService.getProperties();

    // Current test, there are no CORS rules, but once we implement setProperties, we can add cors rules
    // these have been validated against the service instead
    if (result && result.cors !== undefined) {
      assert.ok(result.cors[0].allowedHeaders.split(",").length >= 0);
      assert.ok(result.cors[0].allowedMethods.split(",").length > 0);
      assert.ok(result.cors[0].allowedOrigins.split(",").length > 0);
      assert.ok(result.cors[0].exposedHeaders.split(",").length >= 0);
      assert.ok(result.cors[0].maxAgeInSeconds >= 0);
    } else {
      assert.notStrictEqual(result, undefined);
    }
    if (result.hourMetrics) {
      // current default configuration is not running with metrics setting enabled
      assert.strictEqual(result.hourMetrics.enabled, false);
    } else {
      assert.notStrictEqual(result.hourMetrics, undefined);
    }
  });

  it("SetServiceProperties @loki", async () => {
    const props = getServicePropertiesForTest();

    await tableService.setProperties(props);
    const result = await tableService.getProperties();

    if (result && result.cors !== undefined) {
      assert.strictEqual(result.cors.length, 3);
      assert.strictEqual(result.cors[0].allowedHeaders.split(",").length, 3);
      assert.strictEqual(result.cors[0].allowedMethods.split(",").length, 6);
      assert.strictEqual(result.cors[0].allowedOrigins.split(",").length, 2);
      assert.strictEqual(result.cors[0].exposedHeaders.split(",").length, 1);
      assert.strictEqual(result.cors[0].maxAgeInSeconds, 100);
    } else {
      assert.notStrictEqual(result, undefined);
    }
    if (result.hourMetrics) {
      // current default configuration is not running with metrics setting enabled
      assert.strictEqual(result.hourMetrics.enabled, false);
    } else {
      assert.notStrictEqual(result.hourMetrics, undefined);
    }
  });
});

describe("table APIs test - secondary location endpoint", () => {
  let server: TableServer;
  const tableService = TableServiceClient.fromConnectionString(
    createSecondaryConnectionStringForTest(testLocalAzuriteInstance),
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

  it("GetServiceStats @loki", async () => {
    const result = await tableService.getStatistics();
    assert.strictEqual(result?.geoReplication?.status, "live");
  });
});
