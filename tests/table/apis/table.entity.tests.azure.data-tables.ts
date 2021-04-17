// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import LogicAppReproEntity from "./table.entity.test.logicapp.entity";
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
const partitionKeyForDataTablesTests: string = getUniqueName("datatablestests");
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

  // https://github.com/Azure/Azurite/issues/754
  it.only("Batch API should correctly process LogicApp style update request sequence", async () => {
    await tableClient.create();
    const logicAppReproEntity = new LogicAppReproEntity();
    const insertedEntityHeaders = await tableClient.createEntity<
      LogicAppReproEntity
    >(logicAppReproEntity);
    assert.notStrictEqual(insertedEntityHeaders.etag, undefined);
    logicAppReproEntity.sequenceNumber = 1;
    logicAppReproEntity.testString = "1";
    const updatedEntityHeaders = await tableClient.updateEntity(
      logicAppReproEntity,
      "Merge"
    );
    assert.notStrictEqual(
      updatedEntityHeaders.etag,
      insertedEntityHeaders.etag
    );
    // make sure that the entity was updated
    const updatedEntity = await tableClient.getEntity<LogicAppReproEntity>(
      logicAppReproEntity.partitionKey,
      logicAppReproEntity.rowKey
    );
    assert.strictEqual(updatedEntity.etag, updatedEntityHeaders.etag);
    assert.strictEqual(updatedEntity.sequenceNumber, 1);
    assert.strictEqual(updatedEntity.testString, "1");
    // simple update works, now test batch updates
    // insert 2 update 1
    const batchEntity1 = new LogicAppReproEntity();
    batchEntity1.rowKey = batchEntity1.rowKey + "1";
    const batchEntity2 = new LogicAppReproEntity();
    batchEntity2.rowKey = batchEntity1.rowKey + "2";
    // here we update the original entity created with non batch insert
    updatedEntity.testString = "2";
    updatedEntity.sequenceNumber = 2;

    // Batch using replace mode
    const batch1 = tableClient.createBatch(batchEntity1.partitionKey);
    batch1.createEntity(batchEntity1);
    batch1.createEntity(batchEntity2);
    batch1.updateEntity(updatedEntity, "Replace");

    const result = await batch1.submitBatch();
    // batch operations succeeded
    assert.strictEqual(
      result.subResponses[0].status,
      204,
      "error with batchEntity1 create"
    );
    assert.strictEqual(
      result.subResponses[1].status,
      204,
      "error with batchEntity2 create"
    );
    assert.strictEqual(
      result.subResponses[2].status,
      204,
      "error with updatedEntity update"
    );
    // we have a new etag from the updated entity
    assert.notStrictEqual(result.subResponses[2].etag, updatedEntity.etag);

    const batch2 = tableClient.createBatch(batchEntity1.partitionKey);
    batch2.deleteEntity(batchEntity1.partitionKey, batchEntity1.rowKey);
    batch2.deleteEntity(batchEntity2.partitionKey, batchEntity2.rowKey);
    batch2.deleteEntity(updatedEntity.partitionKey, updatedEntity.rowKey, {
      etag: result.subResponses[2].etag
    });

    const result2 = await batch2.submitBatch();
    assert.strictEqual(
      result2.subResponses[0].status,
      204,
      "error with batchEntity1 delete"
    );
    assert.strictEqual(
      result2.subResponses[1].status,
      204,
      "error with batchEntity2 delete"
    );
    assert.strictEqual(
      result2.subResponses[2].status,
      204,
      "error with updatedEntity delete"
    );

    await tableClient.delete();
  });
});
