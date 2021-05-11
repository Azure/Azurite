// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import LogicAppReproEntity from "./table.entity.test.logicapp.entity";
import { TableClient, TablesSharedKeyCredential } from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName
} from "../../testutils";
import {
  AzureDataTablesTestEntity,
  createBasicEntityForTest
} from "./AzureDataTablesTestEntity";
import {
  createTableServerForTestHttps,
  createUniquePartitionKey,
  HOST,
  PORT
} from "./table.entity.test.utils";

// Set true to enable debug log
configLogger(false);

describe("table Entity APIs test", () => {
  let server: TableServer;
  const tableName: string = getUniqueName("datatables");

  const tableClient = new TableClient(
    `https://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}`,
    tableName,
    new TablesSharedKeyCredential(EMULATOR_ACCOUNT_NAME, EMULATOR_ACCOUNT_KEY)
  );

  const requestOverride = { headers: {} };

  before(async () => {
    server = createTableServerForTestHttps();
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
    const partitionKey = createUniquePartitionKey();
    const testEntities: AzureDataTablesTestEntity[] = [
      createBasicEntityForTest(partitionKey),
      createBasicEntityForTest(partitionKey),
      createBasicEntityForTest(partitionKey)
    ];

    await tableClient.create();
    const batch = tableClient.createBatch(partitionKey);
    await batch.createEntities(testEntities);
    const result = await batch.submitBatch();
    assert.ok(result.subResponses[0].rowKey);
    await tableClient.delete();
  });

  // https://github.com/Azure/Azurite/issues/754
  it("Batch API should correctly process LogicApp style update request sequence", async () => {
    await tableClient.create();
    const logicAppReproEntity = new LogicAppReproEntity();
    const insertedEntityHeaders = await tableClient.createEntity<LogicAppReproEntity>(
      logicAppReproEntity
    );
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

  it("Should return bad request error for incorrectly formatted etags, @loki", async () => {
    const partitionKey = createUniquePartitionKey();
    const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
      partitionKey
    );

    await tableClient.create();

    const result = await tableClient.createEntity(testEntity);

    const updateEntity = await tableClient.updateEntity(testEntity, "Merge", {
      etag: result.etag
    });

    assert.notStrictEqual(
      updateEntity.etag,
      undefined,
      "failed to update entity"
    );

    await tableClient
      .updateEntity(testEntity, "Merge", {
        etag: "blah"
      })
      .catch((updateError) => {
        assert.strictEqual(
          updateError.response.status,
          400,
          "did not get the expected bad request"
        );
      });

    await tableClient
      .deleteEntity(testEntity.partitionKey, testEntity.rowKey, {
        etag: "blah"
      })
      .catch((updateError) => {
        assert.strictEqual(
          updateError.response.status,
          400,
          "did not get the expected bad request"
        );
      });

    await tableClient.delete();
  });

  it("should find an int as a number, @loki", async () => {
    const partitionKey = createUniquePartitionKey();
    const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
      partitionKey
    );

    await tableClient.create({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const queryResult = await tableClient
      .listEntities<AzureDataTablesTestEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${partitionKey}' and int32Field eq 54321`
        }
      })
      .next();
    assert.notStrictEqual(queryResult.value, undefined);
    await tableClient.delete();
  });

  it("should find a long int, @loki", async () => {
    const partitionKey = createUniquePartitionKey();
    const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
      partitionKey
    );

    await tableClient.create({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const queryResult = await tableClient
      .listEntities<AzureDataTablesTestEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${partitionKey}' and int64Field eq 12345L`
        }
      })
      .next();
    assert.notStrictEqual(queryResult.value, undefined);

    await tableClient.delete();
  });
});
