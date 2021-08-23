// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import LogicAppReproEntity from "./table.entity.test.logicapp.entity";
import {
  odata,
  TableEntity,
  TableClient,
  TableTransaction
} from "@azure/data-tables";
import { AzureNamedKeyCredential } from "@azure/core-auth";
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

  const sharedKeyCredential = new AzureNamedKeyCredential(
    EMULATOR_ACCOUNT_NAME,
    EMULATOR_ACCOUNT_KEY
  );

  const tableClient = new TableClient(
    `https://${HOST}:${PORT}/${EMULATOR_ACCOUNT_NAME}`,
    tableName,
    sharedKeyCredential
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
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey();
    const testEntities: AzureDataTablesTestEntity[] = [
      createBasicEntityForTest(partitionKey),
      createBasicEntityForTest(partitionKey),
      createBasicEntityForTest(partitionKey)
    ];
    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    const result = await tableClient.submitTransaction(transaction.actions);

    assert.ok(result.subResponses[0].rowKey);
    await tableClient.deleteTable();
  });

  // https://github.com/Azure/Azurite/issues/754
  it("Batch API should correctly process LogicApp style update request sequence", async () => {
    await tableClient.createTable();
    const logicAppReproEntity = new LogicAppReproEntity();
    const insertedEntityHeaders =
      await tableClient.createEntity<LogicAppReproEntity>(logicAppReproEntity);
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
    const transaction = new TableTransaction();

    transaction.createEntity(batchEntity1);
    transaction.createEntity(batchEntity2);
    transaction.updateEntity(updatedEntity, "Replace");

    const result = await tableClient.submitTransaction(transaction.actions);

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

    const transaction2 = new TableTransaction();
    transaction2.deleteEntity(batchEntity1.partitionKey, batchEntity1.rowKey);
    transaction2.deleteEntity(batchEntity2.partitionKey, batchEntity2.rowKey);
    transaction2.deleteEntity(updatedEntity.partitionKey, updatedEntity.rowKey);

    const result2 = await tableClient.submitTransaction(transaction2.actions);
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

    await tableClient.deleteTable();
  });

  it("Should return bad request error for incorrectly formatted etags, @loki", async () => {
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey();
    const testEntity: AzureDataTablesTestEntity =
      createBasicEntityForTest(partitionKey);

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

    await tableClient.deleteTable();
  });

  it("should find an int as a number, @loki", async () => {
    const partitionKey = createUniquePartitionKey();
    const testEntity: AzureDataTablesTestEntity =
      createBasicEntityForTest(partitionKey);

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
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
    await tableClient.deleteTable();
  });

  it("should find a long int, @loki", async () => {
    const partitionKey = createUniquePartitionKey();
    const testEntity: AzureDataTablesTestEntity =
      createBasicEntityForTest(partitionKey);

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
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

    await tableClient.deleteTable();
  });

  it("should find an entity using a partition key with multiple spaces, @loki", async () => {
    const partitionKey = createUniquePartitionKey() + " with spaces";
    const testEntity: AzureDataTablesTestEntity =
      createBasicEntityForTest(partitionKey);

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const queryResult = await tableClient
      .listEntities<AzureDataTablesTestEntity>({
        queryOptions: {
          filter: `PartitionKey eq '${partitionKey}'`
        }
      })
      .next();
    assert.notStrictEqual(queryResult.value, undefined);

    await tableClient.deleteTable();
  });

  it("should provide a complete query result when using query entities by page, @loki", async () => {
    const partitionKeyForQueryTest = createUniquePartitionKey();
    const totalItems = 20;
    await tableClient.createTable();

    for (let i = 0; i < totalItems; i++) {
      const result = await tableClient.createEntity({
        partitionKey: partitionKeyForQueryTest,
        rowKey: `${i}`,
        foo: "testEntity"
      });
      assert.notStrictEqual(result.etag, undefined);
    }

    const maxPageSize = 5;
    const entities = tableClient.listEntities<TableEntity<{ foo: string }>>({
      queryOptions: {
        filter: odata`PartitionKey eq ${partitionKeyForQueryTest}`
      }
    });
    let all: TableEntity<{ foo: string }>[] = [];
    for await (const entity of entities.byPage({
      maxPageSize
    })) {
      all = [...all, ...entity];
    }
    assert.strictEqual(all.length, totalItems);
    all.sort((obj1, obj2) => {
      if (parseInt(obj1.rowKey, 10) > parseInt(obj2.rowKey, 10)) {
        return 1;
      } else if (obj1.rowKey === obj2.rowKey) {
        return 0;
      } else {
        return -1;
      }
    });
    let rowKeyChecker = 0;
    while (rowKeyChecker < totalItems) {
      assert.strictEqual(all[rowKeyChecker].rowKey, rowKeyChecker.toString());
      rowKeyChecker++;
    }
    await tableClient.deleteTable();
  });

  it("should return the correct number of results querying with a timestamp or different SDK whitespacing behaviours, @loki", async () => {
    const partitionKeyForQueryTest = createUniquePartitionKey();
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    const newTimeStamp = timestamp.toISOString();
    for (let i = 0; i < totalItems; i++) {
      const result = await tableClient.createEntity({
        partitionKey: partitionKeyForQueryTest,
        rowKey: `${i}`,
        number: i
      });
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 5;
    let testsCompleted = 0;
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} && number gt 11`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} && number lt 11`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} && number gt 11 && Timestamp lt datetime'${newTimeStamp}'`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} && number lt 11 && Timestamp lt datetime'${newTimeStamp}'`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) && (number lt 12) && (Timestamp lt datetime'${newTimeStamp}')`
        },
        expectedResult: 10
      }
    ];

    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<
        TableEntity<{ number: number }>
      >({
        queryOptions: queryTest.queryOptions
      });
      let all: TableEntity<{ number: number }>[] = [];
      for await (const entity of entities.byPage({
        maxPageSize
      })) {
        all = [...all, ...entity];
      }
      assert.strictEqual(all.length, queryTest.expectedResult);
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, 5);
    await tableClient.deleteTable();
  });
});
