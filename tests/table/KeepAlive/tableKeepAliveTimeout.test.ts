import * as assert from "assert";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName, restoreBuildRequestOptions } from "../../testutils";
import {
  createConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";
import { DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT } from "../../../src/table/utils/constants";
import { TableClient } from "@azure/data-tables";
import type { FullOperationResponse } from "@azure/core-client/types/latest/core-client";

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
  const tableName: string = getUniqueName("table");
  const tableService = TableClient.fromConnectionString(
    createConnectionStringForTest(testLocalAzuriteInstance),
    tableName,
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

  it("request with enabled keep-alive shall return DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT", async () => {
    let response: FullOperationResponse | undefined;
    await tableService.createTable();
    await tableService.getAccessPolicy({
      onResponse: (rawResponse) => (response = rawResponse)
    });
    if (response !== undefined && response.parsedHeaders?.["keep-alive"]) {
      assert.strictEqual(
        response.parsedHeaders["keep-alive"],
        "timeout=" + DEFAULT_TABLE_KEEP_ALIVE_TIMEOUT
      );
    }
  });
});
