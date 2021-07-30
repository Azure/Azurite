import * as assert from "assert";
import * as Azure from "azure-storage";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { overrideRequest, restoreBuildRequestOptions } from "../../testutils";
import {
  createConnectionStringForTest,
  createTableServerForTest
} from "./table.entity.test.utils";

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
  const tableService = Azure.createTableService(
    createConnectionStringForTest(testLocalAzuriteInstance)
  );
  tableService.enableGlobalHttpAgent = true;

  const requestOverride = { headers: {} };

  before(async () => {
    overrideRequest(requestOverride, tableService);
    server = createTableServerForTest();
    await server.start();
  });

  after(async () => {
    restoreBuildRequestOptions(tableService);
    tableService.removeAllListeners();
    await server.close();
  });

  it("GetServiceProperties @loki @sql", async () => {
    const getServicePropsPromise = () => {
      return new Promise<Azure.common.models.ServicePropertiesResult.ServiceProperties>(
        (resolve, reject) => {
          tableService.getServiceProperties((error, result, response) => {
            if (error) return reject(error);
            assert.ok(response.isSuccessful);
            resolve(result);
          });
        }
      );
    };

    await getServicePropsPromise()
      .then((result) => {
        // Current test, there are no CORS rules, but once we implement setProperties, we can add cors rules
        // these have been validated against the service instead
        if (result && result.Cors && result.Cors.CorsRule !== undefined) {
          assert.ok(result.Cors.CorsRule[0].AllowedHeaders.length >= 0);
          assert.ok(result.Cors.CorsRule[0].AllowedMethods.length > 0);
          assert.ok(result.Cors.CorsRule[0].AllowedOrigins.length > 0);
          assert.ok(result.Cors.CorsRule[0].ExposedHeaders.length >= 0);
          assert.ok(result.Cors.CorsRule[0].MaxAgeInSeconds >= 0);
        } else {
          assert.notStrictEqual(result, undefined);
        }
        if (result.HourMetrics) {
          // current default configuration is not running with metrics setting enabled
          assert.strictEqual(result.HourMetrics.Enabled, false);
        } else {
          assert.notStrictEqual(result.HourMetrics, undefined);
        }
      })
      .catch((err) => {
        assert.ifError(err);
      });
  });
});
