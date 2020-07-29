import * as assert from "assert";
import * as Azure from "azure-storage";

import { configLogger } from "../../../src/common/Logger";
import TableConfiguration from "../../../src/table/TableConfiguration";
import TableServer from "../../../src/table/TableServer";
// import { TABLE_API_VERSION } from "../../../src/table/utils/constants";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  overrideRequest
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("table Entity APIs test", () => {
  // TODO: Create a server factory as tests utils
  const protocol = "http";
  const host = "127.0.0.1";
  const port = 11002;
  const metadataDbPath = "__tableTestsStorage__";

  const config = new TableConfiguration(
    host,
    port,
    metadataDbPath,
    false,
    false
  );

  let server: TableServer;
  const accountName = EMULATOR_ACCOUNT_NAME;
  const sharedKey = EMULATOR_ACCOUNT_KEY;
  const connectionString =
    `DefaultEndpointsProtocol=${protocol};AccountName=${accountName};` +
    `AccountKey=${sharedKey};TableEndpoint=${protocol}://${host}:${port}/${accountName};`;

  const tableService = Azure.createTableService(connectionString);

  let tableName: string = getUniqueName("table");

  const requestOverride = { headers: {} };
  overrideRequest(requestOverride, tableService);

  before(async () => {
    server = new TableServer(config);
    tableName = getUniqueName("table");
    await server.start();
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };

    tableService.createTable(tableName, (error, result, response) => {
      // created table for tests
    });
  });

  after(async () => {
    tableService.deleteTable(tableName, (error, result) => {
      // test table is cleaned up
    });
    await server.close();
  });

  it("Should insert new Entity, @loki", done => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity
    const entity = {
      PartitionKey: "part1",
      RowKey: "row1",
      myValue: "value1"
    };
    tableService.insertEntity(tableName, entity, (error, result, response) => {
      assert.equal(response.statusCode, 201);
      done();
    });
  });

  it("Should delete an Entity given partition key and row key in the URL, @loki", done => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entity = {
      PartitionKey: "part1",
      RowKey: "row1",
      myValue: "value1"
    };

    tableService.deleteEntity(tableName, entity, (error, response) => {
      assert.equal(response.statusCode, 204);
      done();
    });
  });
});
