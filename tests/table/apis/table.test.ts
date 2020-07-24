import * as assert from "assert";
import * as Azure from "azure-storage";

import { configLogger } from "../../../src/common/Logger";
import TableConfiguration from "../../../src/table/TableConfiguration";
import TableServer from "../../../src/table/TableServer";
import { TABLE_API_VERSION } from "../../../src/table/utils/constants";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("table APIs test", () => {
  // TODO: Create a server factory as tests utils
  const protocol = "http";
  const host = "127.0.0.1";
  const port = 11002;
  const metadataDbPath = "__tableTestsStorage__";

  const config = new TableConfiguration(host, port, metadataDbPath, false);

  let server: TableServer;
  const tableName: string = getUniqueName("table");
  const accountName = EMULATOR_ACCOUNT_NAME;
  const sharedKey = EMULATOR_ACCOUNT_KEY;
  const connectionString =
    `DefaultEndpointsProtocol=${protocol};AccountName=${accountName};` +
    `AccountKey=${sharedKey};TableEndpoint=${protocol}://${host}:${port}/${accountName};`;

  before(async () => {
    server = new TableServer(config);
    await server.start();
  });

  it("createTable @loki", done => {
    const tableService = Azure.createTableService(connectionString);

    tableService.createTable(tableName, (error, result, response) => {
      if (!error) {
        assert.equal(result.TableName, tableName);
        assert.equal(result.statusCode, 201);
        const headers = response.headers!;
        assert.equal(headers["x-ms-version"], TABLE_API_VERSION);
      }
      done();
    });
  });

  after(async () => {
    await server.close();
  });
});
