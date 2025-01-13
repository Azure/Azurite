import * as assert from "assert";
import * as Azure from "azure-storage";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import {
  overrideRequest, restoreBuildRequestOptions
} from "../../testutils";
import {
  createConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";
import { DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT } from "../../../src/table/utils/constants";

// Set true to enable debug log
configLogger(false);

// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

describe("Table Keep-Alive header response test", () => {
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

  it("request with enabled keep-alive shall return DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT", (done) => {
    tableService.getServiceProperties(
      (error, _, response) => {
        if (!error) {
          if (response.headers !== undefined) {
            const keepAliveHeader = response.headers["keep-alive"];
            if (keepAliveHeader !== undefined) {
              assert.strictEqual(keepAliveHeader, "timeout="+DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT);
            }
          }
        } else {
          assert.fail(error);
        }
        done();
      });
  });
});