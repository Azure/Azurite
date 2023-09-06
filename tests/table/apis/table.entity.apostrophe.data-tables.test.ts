// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import { TableClient, TableTransaction } from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  AzureDataTablesTestEntityFactory,
  TableTestEntity
} from "../models/AzureDataTablesTestEntityFactory";
import {
  createAzureDataTablesClient,
  createTableServerForTestHttps
} from "../utils/table.entity.test.utils";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

const entityFactory = new AzureDataTablesTestEntityFactory();

describe("table Entity APIs test - Apostrophe Tests using Azure/data-tables", () => {
  let server: TableServer;

  before(async () => {
    server = createTableServerForTestHttps();
    await server.start();
  });

  after(async () => {
    await server.close();
  });

  // https://github.com/Azure/Azurite/issues/1481
  it("01. Should create, get and delete entities using PartitionKey and RowKey containing double apostrophe, @loki", async () => {
    const tableClient = await createTestTable("simpleApostrophe");
    const oneApostrophePartition = "apos'strophe";
    const oneApostropheEntity1 = await simpleCreateKeyTest(
      oneApostrophePartition,
      "O'1",
      tableClient
    );
    const oneApostropheEntity2 = await simpleCreateKeyTest(
      oneApostrophePartition,
      "O'2",
      tableClient
    );

    const twoApostrophePartition = "apos''strophe";
    const twoApostropheEntity1 = await simpleCreateKeyTest(
      twoApostrophePartition,
      "O''1",
      tableClient
    );
    const twoApostropheEntity2 = await simpleCreateKeyTest(
      twoApostrophePartition,
      "O''2",
      tableClient
    );

    // now delete the entities and ensure that delete path is valid
    await simpleDeleteKeyTest(
      twoApostropheEntity2.partitionKey,
      twoApostropheEntity2.rowKey,
      tableClient
    );
    await simpleDeleteKeyTest(
      oneApostropheEntity1.partitionKey,
      oneApostropheEntity1.rowKey,
      tableClient
    );
    await simpleDeleteKeyTest(
      oneApostropheEntity2.partitionKey,
      oneApostropheEntity2.rowKey,
      tableClient
    );
    await simpleDeleteKeyTest(
      twoApostropheEntity1.partitionKey,
      twoApostropheEntity1.rowKey,
      tableClient
    );

    await tableClient.deleteTable();
  });

  it("02. Should create, get and delete entities using PartitionKey and RowKey containing double apostrophe in Batch, @loki", async () => {
    const tableClient = await createTestTable("batchApostrophe");
    const singleApostrophe = "apos'strophe";
    const doubleApostrophe = "apos''strophe";
    const testEntities1: { partitionKey: string; rowKey: string }[] = [
      {
        partitionKey: singleApostrophe,
        rowKey: singleApostrophe + "1"
      },
      {
        partitionKey: singleApostrophe,
        rowKey: singleApostrophe + "2"
      },
      {
        partitionKey: singleApostrophe,
        rowKey: doubleApostrophe + "1"
      },
      {
        partitionKey: singleApostrophe,
        rowKey: doubleApostrophe + "2"
      }
    ];
    const testEntities2: { partitionKey: string; rowKey: string }[] = [
      {
        partitionKey: doubleApostrophe,
        rowKey: doubleApostrophe + "1"
      },
      {
        partitionKey: doubleApostrophe,
        rowKey: doubleApostrophe + "2"
      },
      {
        partitionKey: doubleApostrophe,
        rowKey: singleApostrophe + "1"
      },
      {
        partitionKey: doubleApostrophe,
        rowKey: singleApostrophe + "2"
      }
    ];

    // First pass and ordering
    await upsertTransactionTest(testEntities1, tableClient);
    await upsertTransactionTest(testEntities2, tableClient);
    await deleteTransactionTest(testEntities1, tableClient);
    await deleteTransactionTest(testEntities2, tableClient);

    // second pass and ordering
    await upsertTransactionTest(testEntities2, tableClient);
    await upsertTransactionTest(testEntities1, tableClient);
    await deleteTransactionTest(testEntities1, tableClient);
    await deleteTransactionTest(testEntities2, tableClient);

    // third pass and ordering
    await upsertTransactionTest(testEntities2, tableClient);
    await upsertTransactionTest(testEntities1, tableClient);
    await deleteTransactionTest(testEntities2, tableClient);
    await deleteTransactionTest(testEntities1, tableClient);

    // fourth pass and ordering
    await upsertTransactionTest(testEntities1, tableClient);
    await upsertTransactionTest(testEntities2, tableClient);
    await deleteTransactionTest(testEntities2, tableClient);
    await deleteTransactionTest(testEntities1, tableClient);

    await tableClient.deleteTable();
  });
});

async function deleteTransactionTest(
  testEntities: { partitionKey: string; rowKey: string }[],
  tableClient: TableClient
) {
  const transaction2 = new TableTransaction();
  for (const testEntity of testEntities) {
    transaction2.deleteEntity(testEntity.partitionKey, testEntity.rowKey);
  }

  try {
    const result = await tableClient.submitTransaction(transaction2.actions);
    assert.notStrictEqual(result, undefined);
    assert.strictEqual(
      result.status,
      202,
      "We did not get a 202 on batch delete"
    );
  } catch (err: any) {
    assert.strictEqual(err, undefined, `We failed to delete with ${err}`);
  }
}

async function upsertTransactionTest(
  testEntities: { partitionKey: string; rowKey: string }[],
  tableClient: TableClient
) {
  const transaction = new TableTransaction();
  for (const testEntity of testEntities) {
    // Upsert will use Batch Merge like the issue reported
    // however the root cause in this case was that the .Net SDK
    // does not add the properties to the request body
    transaction.upsertEntity(testEntity);
  }
  try {
    const result = await tableClient.submitTransaction(transaction.actions);
    assert.strictEqual(result.status, 202);
    assert.strictEqual(result.subResponses.length, testEntities.length);
    assert.strictEqual(result.subResponses[0].status, 204);
    assert.strictEqual(result.subResponses[1].status, 204);
  } catch (err: any) {
    assert.strictEqual(err, undefined, `We failed to create with ${err}`);
  }

  // validate that we successfully created each entity,
  // and that the format of the row key was not changed by serialization
  try {
    for (const entity of testEntities) {
      const entity0 = await tableClient.getEntity<TableTestEntity>(
        entity.partitionKey,
        entity.rowKey
      );
      assert.strictEqual(entity0.rowKey, entity.rowKey);
    }
  } catch (err: any) {
    assert.strictEqual(err, undefined, `We failed to retrieve with ${err}`);
  }
}

async function createTestTable(tableName: string): Promise<TableClient> {
  const tableClient = createAzureDataTablesClient(
    testLocalAzuriteInstance,
    getUniqueName(tableName)
  );

  // first create 2 partitions and 2 keys with 1 apostrophe
  await tableClient.createTable();
  return tableClient;
}

async function simpleDeleteKeyTest(
  apostrophePartition: string,
  apostropheRowKey: string,
  tableClient: TableClient
) {
  // now delete the entity and ensure that delete path is valid
  try {
    const result = await tableClient.deleteEntity(
      apostrophePartition,
      apostropheRowKey
    );
    assert.notStrictEqual(result, undefined);
  } catch (err: any) {
    assert.strictEqual(err, undefined, `We failed to delete with ${err}`);
  }

  // check that deleted entity is gone
  try {
    const entity1 = await tableClient.getEntity<TableTestEntity>(
      apostrophePartition,
      apostropheRowKey
    );
    assert.strictEqual(entity1, undefined);
  } catch (err: any) {
    assert.strictEqual(
      err.statusCode,
      404,
      `We should failed to retrieve with ResourceNotFound, but got ${err}`
    );
  }
}

async function simpleCreateKeyTest(
  apostrophePartition: string,
  apostropheRowKey: string,
  tableClient: TableClient
): Promise<{ partitionKey: string; rowKey: string }> {
  const testEntityApostrophe: TableTestEntity =
    entityFactory.createBasicEntityForTest(apostrophePartition);

  testEntityApostrophe.rowKey = apostropheRowKey;

  try {
    const result = await tableClient.createEntity(testEntityApostrophe);
    assert.ok(result.etag);
  } catch (err: any) {
    assert.strictEqual(err, undefined, `We failed to create with ${err}`);
  }

  // validate that we successfully created each entity,
  // and that the format of the row key was not changed by serialization
  try {
    const entity0 = await tableClient.getEntity<TableTestEntity>(
      testEntityApostrophe.partitionKey,
      testEntityApostrophe.rowKey
    );

    assert.strictEqual(entity0.rowKey, testEntityApostrophe.rowKey);
    return {
      partitionKey: testEntityApostrophe.partitionKey,
      rowKey: testEntityApostrophe.rowKey
    };
  } catch (err: any) {
    assert.strictEqual(err, undefined, `We failed to retrieve with ${err}`);
  }

  return {
    partitionKey: testEntityApostrophe.partitionKey,
    rowKey: testEntityApostrophe.rowKey
  };
}
