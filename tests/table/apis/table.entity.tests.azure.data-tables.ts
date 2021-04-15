// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import { TableClient, TablesSharedKeyCredential } from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";
import TableConfiguration from "../../../src/table/TableConfiguration";
import TableServer from "../../../src/table/TableServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";

// Set true to enable debug log
configLogger(false);
const partitionKeyForDataTablesTests: string = "datatables-tests";
/**
 * Creates an entity for tests, with a randomized row key,
 * to avoid conflicts on inserts.
 *
 * @return {*}  {TestEntity}
 */
function createBasicEntityForTest(): AzureDataTablesTestEntity {
  return new AzureDataTablesTestEntity(
    partitionKeyForDataTablesTests,
    getUniqueName("row"),
    "value1"
  );
}

class AzureDataTablesTestEntity {
  public partitionKey: string;
  public rowKey: string;
  public myValue: string;
  constructor(part: string, row: string, value: string) {
    this.partitionKey = part;
    this.rowKey = row;
    this.myValue = value;
  }
}

describe("table Entity APIs test", () => {
  // TODO: Create a server factory as tests utils
  const protocol = "https";
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
    true,
    "tests/server.cert",
    "tests/server.key"
  );

  let server: TableServer;
  const accountName = EMULATOR_ACCOUNT_NAME;
  const sharedKey = EMULATOR_ACCOUNT_KEY;
  const tableName: string = getUniqueName("datatables");

  const tableClient = new TableClient(
    `${protocol}://${host}:${port}/${accountName}`,
    tableName,
    new TablesSharedKeyCredential(accountName, sharedKey)
  );

  const requestOverride = { headers: {} };

  before(async () => {
    server = new TableServer(config);
    await server.start();
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
  });

  after(async () => {
    await server.close();
  });

  it("Batch API should return row keys in format understood by @azure/data-tables, @loki", async () => {
    const testEntities: AzureDataTablesTestEntity[] = [
      createBasicEntityForTest(),
      createBasicEntityForTest(),
      createBasicEntityForTest()
    ];

    await tableClient.create();
    const batch = tableClient.createBatch(partitionKeyForDataTablesTests);
    await batch.createEntities(testEntities);
    const result = await batch.submitBatch();
    assert.ok(result.subResponses[0].rowKey);
    await tableClient.delete();
  });
});
