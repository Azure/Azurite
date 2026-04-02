// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName, restoreBuildRequestOptions } from "../../testutils";

import { TestEntity } from "../models/TestEntity";
import { AzureStorageSDKEntityFactory } from "../utils/AzureStorageSDKEntityFactory";
import {
  createConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";
import { TableClient, TableTransaction } from "@azure/data-tables";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

const entityFactory = new AzureStorageSDKEntityFactory();

describe("table Entity APIs test - Apostrophe Tests using Azure-Storage", () => {
  let server: TableServer;

  let tableName: string = getUniqueName("table");
  const tableService = TableClient.fromConnectionString(
    createConnectionStringForTest(testLocalAzuriteInstance),
    tableName,
    { allowInsecureConnection: true }
  );

  before(async () => {
    server = createTableServerForTest();
    tableName = getUniqueName("table");
    await server.start();

    const created = new Promise((resolve, reject) => {
      tableService.createTable().then(resolve, reject);
    });

    // we need to await here as we now also test against the service
    // which is not as fast as our in memory DBs
    await created.then().catch((createError) => {
      throw new Error("failed to create table");
    });
  });

  after(async () => {
    restoreBuildRequestOptions(tableService);
    await server.close();
  });

  // https://github.com/Azure/Azurite/issues/1481
  it("01. Operates on batch items with double apostrophe in the middle, @loki", async () => {
    const singleApostrophePartition = "apos'strophe";
    const singleApostropheRowKey = "row'key";
    const doubleApostrophePartition = "apos''strophe";
    const doubleApostropheRowKey = "row''key";

    const testEntities1: TestEntity[] = [];
    // singleApostrophePartition tests
    // pk ' rk '
    const insertEntity1 = entityFactory.createBasicEntityForTest();
    insertEntity1.partitionKey = singleApostrophePartition;
    insertEntity1.rowKey = singleApostropheRowKey + "1";
    testEntities1.push(insertEntity1);
    // pk ' rk ''
    const insertEntity2 = entityFactory.createBasicEntityForTest();
    insertEntity2.partitionKey = singleApostrophePartition;
    insertEntity2.rowKey = doubleApostropheRowKey + "1";
    testEntities1.push(insertEntity2);
    // pk ' rk '
    const insertEntity3 = entityFactory.createBasicEntityForTest();
    insertEntity3.partitionKey = singleApostrophePartition;
    insertEntity3.rowKey = singleApostropheRowKey + "2";
    testEntities1.push(insertEntity3);
    // pk ' rk ''
    const insertEntity4 = entityFactory.createBasicEntityForTest();
    insertEntity4.partitionKey = singleApostrophePartition;
    insertEntity4.rowKey = doubleApostropheRowKey + "2";
    testEntities1.push(insertEntity4);

    // doubleApostrophePartition tests
    const testEntities2: TestEntity[] = [];
    // pk ' rk '
    const doubleEntity1 = entityFactory.createBasicEntityForTest();
    doubleEntity1.partitionKey = doubleApostrophePartition;
    doubleEntity1.rowKey = singleApostropheRowKey + "1";
    testEntities2.push(doubleEntity1);
    // pk ' rk ''
    const doubleEntity2 = entityFactory.createBasicEntityForTest();
    doubleEntity2.partitionKey = doubleApostrophePartition;
    doubleEntity2.rowKey = doubleApostropheRowKey + "1";
    testEntities2.push(doubleEntity2);
    // pk ' rk '
    const doubleEntity3 = entityFactory.createBasicEntityForTest();
    doubleEntity3.partitionKey = doubleApostrophePartition;
    doubleEntity3.rowKey = singleApostropheRowKey + "2";
    testEntities2.push(doubleEntity3);
    // pk ' rk ''
    const doubleEntity4 = entityFactory.createBasicEntityForTest();
    doubleEntity4.partitionKey = doubleApostrophePartition;
    doubleEntity4.rowKey = doubleApostropheRowKey + "2";
    testEntities2.push(doubleEntity4);

    // create Batch Transactions then delete batch transactions
    await testInsertBatch(testEntities1, tableService);
    await testInsertBatch(testEntities2, tableService);
    await testMergeBatch(testEntities1, tableService);
    await testMergeBatch(testEntities2, tableService);
    await testDeleteBatch(testEntities1, tableService);
    await testDeleteBatch(testEntities2, tableService);
  });

  it("02. Merge on an Entity with double quote in PartitionKey and RowKey, @loki", async () => {
    const partitionKey = "pk double''quote string";
    const rowKey = "rk double''quote string";

    // Insert entity with the specific pk,rk
    const entityInsert = new TestEntity(partitionKey, rowKey, "value1");
    await tableService.createEntity(entityInsert);

    // merge entity with the specific pk,rk, to a different value
    const entityMerge = new TestEntity(partitionKey, rowKey, "value2");
    await tableService.upsertEntity(entityMerge, "Merge");

    // retrieve entity with the specific pk,rk, and validate value is updated
    const result = await tableService.getEntity<TestEntity>(
      partitionKey,
      rowKey
    );

    assert.strictEqual(result.partitionKey, partitionKey);
    assert.strictEqual(result.rowKey, rowKey);
    assert.strictEqual(result.myValue, "value2");
  });
});

async function testInsertBatch(
  testEntities: TestEntity[],
  tableService: TableClient
): Promise<void> {
  const insertEntityBatch = new TableTransaction();
  for (const entity of testEntities) {
    insertEntityBatch.createEntity(entity);
  }

  await tableService.submitTransaction(insertEntityBatch.actions);

  await tableService.getEntity<TestEntity>(
    testEntities[2].partitionKey,
    testEntities[2].rowKey
  );
  await tableService.getEntity<TestEntity>(
    testEntities[3].partitionKey,
    testEntities[3].rowKey
  );
  await tableService.getEntity<TestEntity>(
    testEntities[0].partitionKey,
    testEntities[0].rowKey
  );
  await tableService.getEntity<TestEntity>(
    testEntities[1].partitionKey,
    testEntities[1].rowKey
  );
}

async function testDeleteBatch(
  testEntities: TestEntity[],
  tableService: TableClient
): Promise<void> {
  const insertEntityBatch = new TableTransaction();
  for (const entity of testEntities) {
    insertEntityBatch.deleteEntity(entity.partitionKey, entity.rowKey);
  }
  await tableService.submitTransaction(insertEntityBatch.actions);
  try {
    await tableService.getEntity<TestEntity>(
      testEntities[2].partitionKey,
      testEntities[2].rowKey
    );
    assert.fail("found deleted entity 3");
  } catch (error) {
    /* success */
  }

  try {
    await tableService.getEntity<TestEntity>(
      testEntities[3].partitionKey,
      testEntities[3].rowKey
    );
    assert.fail("found deleted entity 4");
  } catch (error) {
    /* success */
  }

  try {
    await tableService.getEntity<TestEntity>(
      testEntities[0].partitionKey,
      testEntities[0].rowKey
    );
    assert.fail("found deleted entity 1");
  } catch (error) {
    /* success */
  }

  try {
    await tableService.getEntity<TestEntity>(
      testEntities[1].partitionKey,
      testEntities[1].rowKey
    );
    assert.fail("found deleted entity 2");
  } catch (error) {
    /* success */
  }
}

async function testMergeBatch(
  testEntities: TestEntity[],
  tableService: TableClient
): Promise<void> {
  const insertEntityBatch = new TableTransaction();
  for (const entity of testEntities) {
    entity.myValue = "new value";
    insertEntityBatch.updateEntity(entity, "Merge");
  }
  await tableService.submitTransaction(insertEntityBatch.actions);
  // the checks below deliberately do not follow the ordering
  // of the entity array
  const entity2 = await tableService.getEntity<TestEntity>(
    testEntities[2].partitionKey,
    testEntities[2].rowKey
  );
  assert.strictEqual(entity2.myValue, "new value");
  const entity3 = await tableService.getEntity<TestEntity>(
    testEntities[3].partitionKey,
    testEntities[3].rowKey
  );
  assert.strictEqual(entity3.myValue, "new value");
  const entity0 = await tableService.getEntity<TestEntity>(
    testEntities[0].partitionKey,
    testEntities[0].rowKey
  );
  assert.strictEqual(entity0.myValue, "new value");
  const entity1 = await tableService.getEntity<TestEntity>(
    testEntities[1].partitionKey,
    testEntities[1].rowKey
  );
  assert.strictEqual(entity1.myValue, "new value");
}
