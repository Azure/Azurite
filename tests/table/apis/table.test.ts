import * as assert from "assert";
import * as Azure from "azure-storage";

import { configLogger } from "../../../src/common/Logger";
import TableConfiguration from "../../../src/table/TableConfiguration";
import TableServer from "../../../src/table/TableServer";
import { TABLE_API_VERSION } from "../../../src/table/utils/constants";
import { EMULATOR_ACCOUNT_KEY, EMULATOR_ACCOUNT_NAME, getUniqueName, overrideRequest } from "../../testutils";

// Set true to enable debug log
configLogger(false);

describe("table APIs test", () => {
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
  });

  after(async () => {
    await server.close();
  });

  it("createTable, prefer=return-no-content, accept=application/json;odata=minimalmetadata @loki", done => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    requestOverride.headers = {
      Prefer: "return-no-content",
      accept: "application/json;odata=minimalmetadata"
    };

    tableService.createTable(tableName, (error, result, response) => {
      if (!error) {
        assert.equal(result.TableName, tableName);
        assert.equal(result.statusCode, 204);
        const headers = response.headers!;
        assert.equal(headers["x-ms-version"], TABLE_API_VERSION);
        assert.deepStrictEqual(response.body, "");
      }
      done();
    });
  });

  it("createTable, prefer=return-content, accept=application/json;odata=fullmetadata @loki", done => {
    /* Azure Storage Table SDK doesn't support customize Accept header and Prefer header,
      thus we workaround this by override request headers to test following 3 OData levels responses.
    - application/json;odata=nometadata
    - application/json;odata=minimalmetadata
    - application/json;odata=fullmetadata
    */
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };

    tableService.createTable(tableName, (error, result, response) => {
      if (!error) {
        assert.equal(result.TableName, tableName);
        assert.equal(result.statusCode, 201);
        const headers = response.headers!;
        assert.equal(headers["x-ms-version"], TABLE_API_VERSION);
        const bodies = response.body! as any;
        assert.deepStrictEqual(bodies.TableName, tableName);
        assert.deepStrictEqual(bodies["odata.type"], `${accountName}.Tables`);
        assert.deepStrictEqual(
          bodies["odata.metadata"],
          `${protocol}://${host}:${port}/${accountName}/$metadata#Tables/@Element`
        );
        assert.deepStrictEqual(
          bodies["odata.id"],
          `${protocol}://${host}:${port}/${accountName}/Tables(${tableName})`
        );
        assert.deepStrictEqual(
          bodies["odata.editLink"],
          `Tables(${tableName})`
        );
      }
      done();
    });
  });

  it("createTable, prefer=return-content, accept=application/json;odata=minimalmetadata @loki", done => {
    // TODO
    done();
  });

  it("createTable, prefer=return-content, accept=application/json;odata=nometadata @loki", done => {
    // TODO
    done();
  });
});
