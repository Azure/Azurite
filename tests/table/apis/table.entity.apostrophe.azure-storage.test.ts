// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import {
  TableClient,
  TableServiceClient,
  TableTransaction
} from "@azure/data-tables";

import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";

import { TestEntity } from "../models/TestEntity";
import { AzureStorageSDKEntityFactory } from "../utils/AzureStorageSDKEntityFactory";
import {
  createConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

const entityFactory = new AzureStorageSDKEntityFactory();

describe("table Entity APIs test - Apostrophe Tests using @azure/data-tables", () => {
  let server: TableServer;
  let tableServiceClient: TableServiceClient;
  let tableClient: TableClient;
  let tableName: string = getUniqueName("table");

  before(async () => {
    server = createTableServerForTest();
    tableName = getUniqueName("table");
    await server.start();

    const connectionString = createConnectionStringForTest(
      testLocalAzuriteInstance
    );
    tableServiceClient = TableServiceClient.fromConnectionString(
      connectionString,
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    tableClient = TableClient.fromConnectionString(
      connectionString,
      tableName,
      {
        allowInsecureConnection: testLocalAzuriteInstance
      }
    );

    await tableServiceClient.createTable(tableName);
  });

  after(async () => {
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

    let testCount = 0;
    // create Batch Transactions then delete batch transactions
    await testInsertBatch(testEntities1, tableClient);
    testCount++;

    await testInsertBatch(testEntities2, tableClient);
    testCount++;

    await testMergeBatch(testEntities1, tableClient);
    testCount++;

    await testMergeBatch(testEntities2, tableClient);
    testCount++;

    await testDeleteBatch(testEntities1, tableClient);
    testCount++;

    await testDeleteBatch(testEntities2, tableClient);

    // Sanity check to make sure all tests ran
    assert.strictEqual(testCount, 5);
  });

  it("02. Merge on an Entity with double quote in PartitionKey and RowKey, @loki", async () => {
    const partitionKey = "pk double''quote string";
    const rowKey = "rk double''quote string";

    // Insert entity with the specific pk,rk
    const entityInsert = new TestEntity(partitionKey, rowKey, "value1");
    await tableClient.createEntity(entityInsert);

    // ✅ Merge entity with updated value
    const entityMerge = new TestEntity(partitionKey, rowKey, "value2");

    await tableClient.updateEntity(entityMerge, "Merge", {
      etag: "*" // unconditional update (matches old SDK behaviour)
    });

    // ✅ Retrieve and validate updated value
    const result = await tableClient.getEntity<TestEntity>(
      partitionKey,
      rowKey
    );

    assert.strictEqual(result.partitionKey, partitionKey);
    assert.strictEqual(result.rowKey, rowKey);
    assert.strictEqual(result.myValue, "value2");
  });

  async function testInsertBatch(
    testEntities: TestEntity[],
    tableClient: TableClient
  ): Promise<void> {
    const transaction = new TableTransaction();

    for (const entity of testEntities) {
      transaction.createEntity(entity);
    }

    const batchResponse = await tableClient.submitTransaction(
      transaction.actions
    );
    assert.strictEqual(batchResponse.status, 202);

    await assertEntityExists(
      tableClient,
      testEntities[2].partitionKey,
      testEntities[2].rowKey,
      "We did not find the 3rd entity!"
    );

    await assertEntityExists(
      tableClient,
      testEntities[3].partitionKey,
      testEntities[3].rowKey,
      "We did not find the 4th entity!"
    );

    await assertEntityExists(
      tableClient,
      testEntities[0].partitionKey,
      testEntities[0].rowKey,
      "We did not find the 1st entity!"
    );

    await assertEntityExists(
      tableClient,
      testEntities[1].partitionKey,
      testEntities[1].rowKey,
      "We did not find the 2nd entity!"
    );
  }

  async function testDeleteBatch(
    testEntities: TestEntity[],
    tableClient: TableClient
  ): Promise<void> {
    const transaction = new TableTransaction();

    for (const entity of testEntities) {
      transaction.deleteEntity(entity.partitionKey, entity.rowKey);
    }

    const batchResponse = await tableClient.submitTransaction(
      transaction.actions
    );
    assert.strictEqual(batchResponse.status, 202);

    for (const subResponse of batchResponse.subResponses) {
      assert.strictEqual(
        subResponse.status,
        204,
        "We did not delete the entity!"
      );
    }

    await assertEntityMissing(
      tableClient,
      testEntities[2].partitionKey,
      testEntities[2].rowKey,
      "We still found the 3rd entity!"
    );

    await assertEntityMissing(
      tableClient,
      testEntities[3].partitionKey,
      testEntities[3].rowKey,
      "We still found the 4th entity!"
    );

    await assertEntityMissing(
      tableClient,
      testEntities[0].partitionKey,
      testEntities[0].rowKey,
      "We still found the 1st entity!"
    );

    await assertEntityMissing(
      tableClient,
      testEntities[1].partitionKey,
      testEntities[1].rowKey,
      "We still found the 2nd entity!"
    );
  }

  async function testMergeBatch(
    testEntities: TestEntity[],
    tableClient: TableClient
  ): Promise<void> {
    const transaction = new TableTransaction();

    for (const entity of testEntities) {
      entity.myValue = "new value";
      transaction.updateEntity(entity, "Merge", { etag: "*" });
    }

    const batchResponse = await tableClient.submitTransaction(
      transaction.actions
    );
    assert.strictEqual(batchResponse.status, 202);

    await assertEntityHasValue(
      tableClient,
      testEntities[2].partitionKey,
      testEntities[2].rowKey,
      "new value",
      "We did not find the matching value on the 3rd entity!"
    );

    await assertEntityHasValue(
      tableClient,
      testEntities[3].partitionKey,
      testEntities[3].rowKey,
      "new value",
      "We did not find the matching value on the 4th entity!"
    );

    await assertEntityHasValue(
      tableClient,
      testEntities[0].partitionKey,
      testEntities[0].rowKey,
      "new value",
      "We did not find the matching value on the 1st entity!"
    );

    await assertEntityHasValue(
      tableClient,
      testEntities[1].partitionKey,
      testEntities[1].rowKey,
      "new value",
      "We did not find the matching value on the 2nd entity!"
    );
  }

  async function assertEntityExists(
    tableClient: TableClient,
    partitionKey: string,
    rowKey: string,
    message: string
  ): Promise<void> {
    const entity = await tableClient.getEntity<TestEntity>(
      partitionKey,
      rowKey
    );
    assert.ok(entity, message);
  }

  async function assertEntityHasValue(
    tableClient: TableClient,
    partitionKey: string,
    rowKey: string,
    expectedValue: string,
    message: string
  ): Promise<void> {
    const entity = await tableClient.getEntity<TestEntity>(
      partitionKey,
      rowKey
    );
    assert.strictEqual(entity.myValue, expectedValue, message);
  }

  async function assertEntityMissing(
    tableClient: TableClient,
    partitionKey: string,
    rowKey: string,
    message: string
  ): Promise<void> {
    try {
      await tableClient.getEntity<TestEntity>(partitionKey, rowKey);
      assert.fail(message);
    } catch (error: any) {
      assert.strictEqual(error.statusCode, 404, message);
    }
  }
});
