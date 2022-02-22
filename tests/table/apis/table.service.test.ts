import * as assert from "assert";
import * as Azure from "azure-storage";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { overrideRequest, restoreBuildRequestOptions } from "../../testutils";
import {
  createConnectionStringForTest,
  createSecondaryConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";
import { getServicePropertiesForTest } from "../utils/table.service.test.properties";

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

  it("GetServiceProperties @loki", async () => {
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

  it("GetServiceStats negative @loki", async () => {
    const getServiceStatsPromise = () => {
      return new Promise<Azure.common.models.ServiceStats>(
        (resolve, reject) => {
          tableService.getServiceStats((error, result, response) => {
            if (error) return reject(error);
            assert.ok(response.isSuccessful);
            resolve(result);
          });
        }
      );
    };

    await getServiceStatsPromise().catch((err) => {
      assert.strictEqual(err.statusCode, 400);
      assert.strictEqual(err.code, "InvalidQueryParameterValue");
      assert.ok(err);
    });
  });

  it("SetServiceProperties @loki", async () => {
    const setServicePropsPromise = (
      properties: Azure.common.models.ServicePropertiesResult.ServiceProperties
    ) => {
      return new Promise<Azure.ServiceResponse>((resolve, reject) => {
        tableService.setServiceProperties(properties, (error, response) => {
          if (error) return reject(error);
          assert.ok(response.isSuccessful);
          resolve(response);
        });
      });
    };

    const props: Azure.common.models.ServicePropertiesResult.ServiceProperties =
      getServicePropertiesForTest();

    await setServicePropsPromise(props)
      .then(async (setResponse) => {
        // now validate props
        assert.strictEqual(setResponse.statusCode, 202);
        const getServicePropsPromise = () => {
          return new Promise<Azure.common.models.ServicePropertiesResult.ServiceProperties>(
            (resolve, reject) => {
              tableService.getServiceProperties(
                (error, result, getResponse) => {
                  if (error) return reject(error);
                  assert.ok(getResponse.isSuccessful);
                  resolve(result);
                }
              );
            }
          );
        };

        await getServicePropsPromise()
          .then((result) => {
            if (result && result.Cors && result.Cors.CorsRule !== undefined) {
              assert.strictEqual(result.Cors.CorsRule.length, 3);
              assert.strictEqual(
                result.Cors.CorsRule[0].AllowedHeaders.length,
                3
              );
              assert.strictEqual(
                result.Cors.CorsRule[0].AllowedMethods.length,
                6
              );
              assert.strictEqual(
                result.Cors.CorsRule[0].AllowedOrigins.length,
                2
              );
              assert.strictEqual(
                result.Cors.CorsRule[0].ExposedHeaders.length,
                1
              );
              assert.strictEqual(result.Cors.CorsRule[0].MaxAgeInSeconds, 100);
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
      })
      .catch((err) => {
        assert.ifError(err);
      });
  });
});

describe("table APIs test - secondary location endpoint", () => {
  let server: TableServer;
  const tableService = Azure.createTableService(
    createSecondaryConnectionStringForTest(testLocalAzuriteInstance)
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

  it("GetServiceStats @loki", async () => {
    const getServiceStatsPromise = () => {
      return new Promise<Azure.common.models.ServiceStats>(
        (resolve, reject) => {
          tableService.getServiceStats((error, result, response) => {
            if (error) return reject(error);
            assert.ok(response.isSuccessful);
            resolve(result);
          });
        }
      );
    };

    await getServiceStatsPromise()
      .then((result) => {
        assert.strictEqual(result.GeoReplication?.Status, "live");
      })
      .catch((err) => {
        assert.ifError(err);
      });
  });
});
