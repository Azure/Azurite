// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import LogicAppReproEntity from "../models/table.entity.test.logicapp.entity";
import { Edm, odata, TableEntity, TableTransaction } from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  AzureDataTablesTestEntity,
  createBasicEntityForTest
} from "../models/AzureDataTablesTestEntity";
import {
  createAzureDataTablesClient,
  createTableServerForTestHttps,
  createUniquePartitionKey
} from "../utils/table.entity.test.utils";
import { TestBooleanPropEntity } from "../models/TestBooleanPropEntity";
import {
  createLargeEntityForTest,
  LargeDataTablesTestEntity
} from "../models/LargeDataTablesTestEntity";
// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

describe("table Entity APIs test - using Azure/data-tables", () => {
  let server: TableServer;

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
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("dataTables")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
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
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("logicapp")
    );
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
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("etags")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
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
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("int")
    );
    const partitionKey = createUniquePartitionKey("");
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
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longint")
    );
    const partitionKey = createUniquePartitionKey("");
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
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("query1s")
    );
    const partitionKey = createUniquePartitionKey("") + " with spaces";
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
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("querybypage")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("");
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
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("sdkspace")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("");
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
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} and number gt 11`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} and number lt 11`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} and number gt 11 and Timestamp lt datetime'${newTimeStamp}'`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`PartitionKey eq ${partitionKeyForQueryTest} and number lt 11 and Timestamp lt datetime'${newTimeStamp}'`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (number lt 12) and (Timestamp lt datetime'${newTimeStamp}')`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and (number lt 12) and(Timestamp lt datetime'${newTimeStamp}')`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and(number lt 12)and(Timestamp lt datetime'${newTimeStamp}')`
        },
        expectedResult: 10
      }
    ];

    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<
        TableEntity<{ number: number }>
      >({
        queryOptions: queryTest.queryOptions,
        disableTypeConversion: true
      });
      let all: TableEntity<{ number: number }>[] = [];
      for await (const entity of entities.byPage({
        maxPageSize
      })) {
        all = [...all, ...entity];
      }
      assert.strictEqual(
        all.length,
        queryTest.expectedResult,
        `Failed on query ${queryTest.queryOptions.filter}`
      );
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, 7, "Not all tests completed");
    await tableClient.deleteTable();
  });

  it("should return the correct number of results querying with a boolean field regardless of whitespacing behaviours, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("bool")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("bool");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const myBool: boolean = i % 2 !== 0 ? true : false;
      const result = await tableClient.createEntity({
        partitionKey: partitionKeyForQueryTest,
        rowKey: `${i}`,
        number: i,
        myBool
      });
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and(myBool eq true )`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (myBool eq true)`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (myBool eq false)`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and (myBool eq false)`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and(myBool eq false)`
        },
        expectedResult: 5
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (myBool eq false)`
        },
        expectedResult: 5
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
      assert.strictEqual(
        all.length,
        queryTest.expectedResult,
        `Failed with query ${queryTest.queryOptions.filter}`
      );
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("should return the correct number of results querying with an int64 field regardless of whitespacing behaviours, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("int64")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("int64");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
        partitionKeyForQueryTest
      );
      testEntity.int64Field = { value: `${i}`, type: "Int64" };
      const result = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    type queryOptions = {
      filter: string;
    };
    type queryAndResult = {
      queryOptions: queryOptions;
      expectedResult: Edm<"Int64">;
    };
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult: queryAndResult[] = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (int64Field eq 1L )`
        },
        expectedResult: { value: "1", type: "Int64" }
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (int64Field eq 2L)`
        },
        expectedResult: { value: "2", type: "Int64" }
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (int64Field eq 6L)`
        },
        expectedResult: { value: "6", type: "Int64" }
      }
    ];

    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<AzureDataTablesTestEntity>({
        queryOptions: queryTest.queryOptions,
        disableTypeConversion: true
      });
      let all: AzureDataTablesTestEntity[] = [];
      for await (const entity of entities.byPage({
        maxPageSize
      })) {
        all = [...all, ...entity];
      }
      assert.strictEqual(
        all.length,
        1,
        `Failed on number of results with query ${queryTest.queryOptions.filter}`
      );

      assert.strictEqual(
        all[0].int64Field.value,
        queryTest.expectedResult.value,
        `Failed to validate value with query ${queryTest.queryOptions.filter}`
      );
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("should return the correct number of results querying with a double field regardless of whitespacing behaviours, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("datatables")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("double");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
        partitionKeyForQueryTest
      );
      const result = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 54.321 )`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 54.321)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 54.321)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField gt 53.321)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField lt 57.321)`
        },
        expectedResult: 10
      }
    ];
    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<AzureDataTablesTestEntity>({
        queryOptions: queryTest.queryOptions
      });
      let all: AzureDataTablesTestEntity[] = [];
      for await (const entity of entities.byPage({
        maxPageSize
      })) {
        all = [...all, ...entity];
      }
      assert.strictEqual(
        all.length,
        queryTest.expectedResult,
        `Failed on number of results with query ${queryTest.queryOptions.filter}`
      );
      assert.strictEqual(
        all[0].doubleField,
        54.321,
        `Failed on value of double returned by query ${queryTest.queryOptions.filter}`
      );
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("should return the correct number of results querying with a double field containing a single digit number regardless of whitespacing behaviours, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("datatables")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("double");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
        partitionKeyForQueryTest
      );
      testEntity.doubleField = { value: 5, type: "Double" };
      const result = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    // take note of the different whitespacing and query formatting:
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 5 )`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 5.0)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField eq 5)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField gt 4)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (doubleField lt 6)`
        },
        expectedResult: 10
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest})and(doubleField lt 6)`
        },
        expectedResult: 10
      }
    ];
    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<AzureDataTablesTestEntity>({
        queryOptions: queryTest.queryOptions
      });
      let all: AzureDataTablesTestEntity[] = [];
      for await (const entity of entities.byPage({
        maxPageSize
      })) {
        all = [...all, ...entity];
      }
      assert.strictEqual(
        all.length,
        queryTest.expectedResult,
        `Failed on number of results with query ${queryTest.queryOptions.filter}`
      );
      assert.strictEqual(
        all[0].doubleField,
        5,
        `Failed on value of double returned by query ${queryTest.queryOptions.filter}`
      );
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("Should respect Boolean property as edm string, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("issue1259")
    );
    await tableClient.createTable();

    try {
      // Testing based on repro given in issue #1259
      const entity1259a = new TestBooleanPropEntity();
      const result1259a = await tableClient.createEntity<TestBooleanPropEntity>(
        entity1259a
      );

      assert.notStrictEqual(
        result1259a.etag,
        undefined,
        "Did not create entity correctly, etag weas null"
      );

      const check1259a = await tableClient.getEntity<TestBooleanPropEntity>(
        entity1259a.partitionKey,
        entity1259a.rowKey
      );

      assert.strictEqual(
        check1259a.prop,
        false,
        "Prop was not correctly set to false"
      );

      const entity1259b = new TestBooleanPropEntity();
      entity1259b.rowKey = "000b";
      entity1259b.prop.value = "true";
      const result1259b = await tableClient.createEntity<TestBooleanPropEntity>(
        entity1259b
      );

      assert.notStrictEqual(
        result1259b.etag,
        undefined,
        "Did not create entity correctly, etag was null"
      );

      const check1259b = await tableClient.getEntity<TestBooleanPropEntity>(
        entity1259b.partitionKey,
        entity1259b.rowKey
      );

      assert.strictEqual(
        check1259b.prop,
        true,
        "Prop was not correctly set to true"
      );
    } catch (err1259b) {
      assert.ifError(err1259b);
    }
  });

  it("Should respect Int32 property as edm string, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("issue1259")
    );
    await tableClient.createTable();

    try {
      // Testing based on repro given in issue #1259
      const entity1259a = new TestBooleanPropEntity();
      const result1259a = await tableClient.createEntity<TestBooleanPropEntity>(
        entity1259a
      );

      assert.notStrictEqual(
        result1259a.etag,
        undefined,
        "Did not create entity correctly, etag weas null"
      );

      const check1259a = await tableClient.getEntity<TestBooleanPropEntity>(
        entity1259a.partitionKey,
        entity1259a.rowKey
      );

      assert.strictEqual(
        check1259a.int32Prop,
        32,
        "Int32 Prop was not correctly set to 32"
      );

      const entity1259b = new TestBooleanPropEntity();
      entity1259b.rowKey = "000b";
      entity1259b.int32Prop.value = "-31";
      const result1259b = await tableClient.createEntity<TestBooleanPropEntity>(
        entity1259b
      );

      assert.notStrictEqual(
        result1259b.etag,
        undefined,
        "Did not create entity correctly, etag was null"
      );

      const check1259b = await tableClient.getEntity<TestBooleanPropEntity>(
        entity1259b.partitionKey,
        entity1259b.rowKey
      );

      assert.strictEqual(
        check1259b.int32Prop,
        -31,
        "Prop was not correctly set to -31"
      );
    } catch (err1259b) {
      assert.ifError(err1259b);
    }

    try {
      const entity1259c = new TestBooleanPropEntity();
      entity1259c.rowKey = "000c";
      entity1259c.int32Prop.value = "-3.1";
      const result1259c = await tableClient.createEntity<TestBooleanPropEntity>(
        entity1259c
      );

      assert.fail(`We should have thrown on ${result1259c}`);
    } catch (err1259c: any) {
      assert.strictEqual(
        err1259c.response.status,
        400,
        "Expecting invalid input!"
      );
    }
  });

  it("should delete an entity with empty row and partition keys, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("empty")
    );
    const partitionKey = "";
    const testEntity: AzureDataTablesTestEntity =
      createBasicEntityForTest(partitionKey);
    testEntity.rowKey = "";

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const deleteResult = await tableClient.deleteEntity("", "");

    assert.notStrictEqual(deleteResult.version, undefined);
  });

  it("should error on query with invalid filter string, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("dataTables")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("filter");
    const totalItems = 10;
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    for (let i = 0; i < totalItems; i++) {
      const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
        partitionKeyForQueryTest
      );
      testEntity.doubleField = { value: 5, type: "Double" };
      const result = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(result.etag, undefined);
    }
    const maxPageSize = 10;
    let testsCompleted = 0;
    // each of these queries is invalid and generates an error against the service
    // case (1 === 1) leads to status code 501 from the service, we return 400
    const queriesAndExpectedResult = [
      {
        queryOptions: {
          filter: odata`(1 === 1)`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`(1)`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`(1 1 1)`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`("a" eq "a")`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest} eq 5.0)`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq eq ${partitionKeyForQueryTest}) and (doubleField eq 5)`
        },
        expectedResult: 0
      },
      {
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and and (doubleField gt 4)`
        },
        expectedResult: 0
      }
    ];
    for (const queryTest of queriesAndExpectedResult) {
      const entities = tableClient.listEntities<AzureDataTablesTestEntity>({
        queryOptions: queryTest.queryOptions
      });

      try {
        let all: AzureDataTablesTestEntity[] = [];
        for await (const entity of entities.byPage({
          maxPageSize
        })) {
          all = [...all, ...entity];
        }
        // we should not hit this assert if the exception is generated.
        // it helps catch the cases which slip through filter validation
        assert.strictEqual(
          all.length,
          -1,
          `Failed on number of results with query ${queryTest.queryOptions.filter}.`
        );
      } catch (filterException: any) {
        assert.strictEqual(
          [400, 501].includes(filterException.statusCode),
          true,
          `Filter "${queryTest.queryOptions.filter}". Unexpected error. We got : ${filterException.message}`
        );
      }
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, queriesAndExpectedResult.length);
    await tableClient.deleteTable();
  });

  it("Should create entity with PartitionKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percent")
    );
    await tableClient.createTable();
    const percentPartitionEntity = createBasicEntityForTest("%percent");
    const insertedEntityHeaders =
      await tableClient.createEntity<AzureDataTablesTestEntity>(
        percentPartitionEntity
      );
    assert.notStrictEqual(
      insertedEntityHeaders.etag,
      undefined,
      "Did not create entity!"
    );

    await tableClient.deleteTable();
  });

  // https://github.com/Azure/Azurite/issues/1286
  it("Should update Etags with sufficient granualrity, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("etags")
    );
    const etags = new Map();
    const iterations = 99;
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntities: AzureDataTablesTestEntity[] = [];
    const testEntity = createBasicEntityForTest(partitionKey);
    const mergeResults: any[] = [];
    const replaceResults: any[] = [];
    for (let i = 0; i < iterations; i++) {
      testEntities[i] = testEntity;
    }

    await tableClient.createEntity(testEntity);

    const result1 = await tableClient.getEntity(
      testEntity.partitionKey,
      testEntity.rowKey
    );
    etags.set(result1.etag, 1);

    // Update entity multiple times
    for (let i = 0; i < iterations; i++) {
      testEntities[i].myValue = i.toString();
    }
    for (let i = 0; i < iterations; i++) {
      mergeResults[i] = await tableClient.updateEntity(
        testEntities[i],
        "Merge"
      );
    }
    for (let i = 0; i < iterations; i++) {
      replaceResults[i] = await tableClient.updateEntity(
        testEntities[i],
        "Replace"
      );
    }

    // now check if any etags were duplicated
    for (let i = 0; i < iterations; i++) {
      if (etags.has(mergeResults[i].etag)) {
        assert.fail(`We had 2 etags the same in merge iteration ${i}`);
      } else {
        etags.set(mergeResults[i].etag, 1);
      }
      if (etags.has(replaceResults[i].etag)) {
        assert.fail(`We had 2 etags the same in replace iteration ${i}`);
      } else {
        etags.set(replaceResults[i].etag, 1);
      }
    }

    await tableClient.deleteTable();
  });

  it("Should delete entity with PartitionKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percent")
    );
    await tableClient.createTable();
    const percentPartitionEntity = createBasicEntityForTest("%percent");
    const insertedEntityHeaders =
      await tableClient.createEntity<AzureDataTablesTestEntity>(
        percentPartitionEntity
      );
    assert.notStrictEqual(insertedEntityHeaders.etag, undefined);

    const deleteEntityHeaders = await tableClient.deleteEntity(
      percentPartitionEntity.partitionKey,
      percentPartitionEntity.rowKey
    );
    assert.notStrictEqual(
      deleteEntityHeaders.version,
      undefined,
      "Failed to delete the entity!"
    );
    try {
      const entityRetrieve = await tableClient.getEntity(
        percentPartitionEntity.partitionKey,
        percentPartitionEntity.rowKey
      );
      assert.strictEqual(
        entityRetrieve,
        undefined,
        "We should not find the entity, it was deleted!"
      );
    } catch (err: any) {
      assert.strictEqual(
        err.statusCode,
        404,
        "We did not get the expected NotFound error!"
      );
    }

    await tableClient.deleteTable();
  });

  [2, 1, 0].map(delta => {
    it(`Should insert entities containing binary properties less than or equal than 64K bytes (delta ${delta}), @loki`, async () => {
      const tableClient = createAzureDataTablesClient(
        testLocalAzuriteInstance,
        getUniqueName(`longbinary${delta}`)
      );
      await tableClient.createTable();
      const partitionKey = createUniquePartitionKey("");
      const testEntity: AzureDataTablesTestEntity =
        createBasicEntityForTest(partitionKey);

      testEntity.binaryField = Buffer.alloc((64 * 1024) - delta);

      const result = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(
        result.etag,
        undefined,
        "Did not create entity!"
      );

      await tableClient.deleteTable();
    });
  });

  [1, 2, 3].map(delta => {
    it(`Should not insert entities containing binary properties greater than 64K bytes (delta ${delta}), @loki`, async () => {
      const tableClient = createAzureDataTablesClient(
        testLocalAzuriteInstance,
        getUniqueName(`toolongbinary${delta}`)
      );
      await tableClient.createTable();
      const partitionKey = createUniquePartitionKey("");
      const testEntity: AzureDataTablesTestEntity =
        createBasicEntityForTest(partitionKey);

      testEntity.binaryField = Buffer.alloc((64 * 1024) + delta);
      try {
        const result = await tableClient.createEntity(testEntity);
        assert.strictEqual(
          result.etag,
          null,
          "We should not have created an entity!"
        );
      } catch (err: any) {
        assert.strictEqual(
          err.statusCode,
          400,
          "We did not get the expected Bad Request error"
        );
        assert.strictEqual(
          err.message.match(/PropertyValueTooLarge/gi).length,
          1,
          "Did not match PropertyValueTooLarge"
        );
      }

      await tableClient.deleteTable();
    });
  });

  it("Should not insert entities containing string properties longer than 32K chars, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: AzureDataTablesTestEntity =
      createBasicEntityForTest(partitionKey);

    testEntity.myValue = testEntity.myValue.padEnd(1024 * 32 + 1, "a");
    try {
      const result = await tableClient.createEntity(testEntity);
      assert.strictEqual(
        result.etag,
        null,
        "We should not have created an entity!"
      );
    } catch (err: any) {
      assert.strictEqual(
        err.statusCode,
        400,
        "We did not get the expected Bad Request error"
      );
      assert.strictEqual(
        err.message.match(/PropertyValueTooLarge/gi).length,
        1,
        "Did not match PropertyValueTooLarge"
      );
    }

    await tableClient.deleteTable();
  });

  it("Should not merge entities containing string properties longer than 32K chars, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: AzureDataTablesTestEntity =
      createBasicEntityForTest(partitionKey);

    try {
      const result1 = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(
        result1.etag,
        null,
        "We should have created the first test entity!"
      );
      testEntity.myValue = testEntity.myValue.padEnd(1024 * 32 + 1, "a");
      const result2 = await tableClient.updateEntity(testEntity, "Merge");
      assert.strictEqual(
        result2.etag,
        null,
        "We should not have updated the entity!"
      );
    } catch (err: any) {
      assert.strictEqual(
        err.statusCode,
        400,
        "We did not get the expected Bad Request error"
      );
      assert.strictEqual(
        err.message.match(/PropertyValueTooLarge/gi).length,
        1,
        "Did not match PropertyValueTooLarge"
      );
    }

    await tableClient.deleteTable();
  });

  it("Should create entity with RowKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percent")
    );
    await tableClient.createTable();
    const percentRowEntity = createBasicEntityForTest("percent");
    percentRowEntity.rowKey = "%" + percentRowEntity.rowKey;
    const insertedEntityHeaders =
      await tableClient.createEntity<AzureDataTablesTestEntity>(
        percentRowEntity
      );
    assert.notStrictEqual(
      insertedEntityHeaders.etag,
      undefined,
      "Did not create entity!"
    );

    await tableClient.deleteTable();
  });

  it("Should not replace entities containing string properties longer than 32K chars, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: AzureDataTablesTestEntity =
      createBasicEntityForTest(partitionKey);

    try {
      const result1 = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(
        result1.etag,
        null,
        "We should have created the first test entity!"
      );
      testEntity.myValue = testEntity.myValue.padEnd(1024 * 32 + 1, "a");
      const result2 = await tableClient.updateEntity(testEntity, "Replace");
      assert.strictEqual(
        result2.etag,
        null,
        "We should not have updated the entity!"
      );
    } catch (err: any) {
      assert.strictEqual(
        err.statusCode,
        400,
        "We did not get the expected Bad Request error"
      );
      assert.strictEqual(
        err.message.match(/PropertyValueTooLarge/gi).length,
        1,
        "Did not match PropertyValueTooLarge"
      );
    }

    await tableClient.deleteTable();
  });

  it("Should delete entity with RowKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percent")
    );
    await tableClient.createTable();
    const percentRowEntity = createBasicEntityForTest("percentRow");
    percentRowEntity.rowKey = "%" + percentRowEntity.rowKey;
    const insertedEntityHeaders =
      await tableClient.createEntity<AzureDataTablesTestEntity>(
        percentRowEntity
      );
    assert.notStrictEqual(insertedEntityHeaders.etag, undefined);

    const deleteEntityHeaders = await tableClient.deleteEntity(
      percentRowEntity.partitionKey,
      percentRowEntity.rowKey
    );
    assert.notStrictEqual(
      deleteEntityHeaders.version,
      undefined,
      "Failed to delete the entity!"
    );
    try {
      const entityRetrieve = await tableClient.getEntity(
        percentRowEntity.partitionKey,
        percentRowEntity.rowKey
      );
      assert.strictEqual(
        entityRetrieve,
        undefined,
        "We should not find the entity, it was deleted!"
      );
    } catch (err: any) {
      assert.strictEqual(
        err.statusCode,
        404,
        "We did not get the expected NotFound error!"
      );
    }

    await tableClient.deleteTable();
  });

  it("Should not insert entities with request body greater than 4 MB, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: LargeDataTablesTestEntity =
      createLargeEntityForTest(partitionKey);

    try {
      const result = await tableClient.createEntity(testEntity);
      assert.strictEqual(
        result.etag,
        null,
        "We should not have created an entity!"
      );
    } catch (err: any) {
      assert.strictEqual(
        err.statusCode,
        413,
        "We did not get the expected 413 error"
      );
      assert.strictEqual(
        err.message.match(/RequestBodyTooLarge/gi).length,
        1,
        "Did not match RequestBodyTooLarge"
      );
    }

    await tableClient.deleteTable();
  });

  it("Should reject batches with request body larger than 4 MB, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("bigBatch")
    );
    await tableClient.createTable();
    const partitionKey = "pk";
    const transaction = new TableTransaction();

    // Each entity is a bit over 4 * 32 * 1024 bytes.
    // This means 32 of these entities will exceed the 4 MB limit.
    for (var i = 0; i < 32; i++) {
      transaction.createEntity({
        partitionKey: partitionKey,
        rowKey: "rk" + i,
        a: "a".repeat(32 * 1024),
        b: "b".repeat(32 * 1024),
        c: "c".repeat(32 * 1024),
        d: "d".repeat(32 * 1024),
      })
    }

    try {
      await tableClient.submitTransaction(transaction.actions);
      assert.fail("We should not have succeeded with the batch!");
    } catch (err: any) {
      assert.strictEqual(
        err.statusCode,
        413,
        "We did not get the expected 413 error"
      );
      assert.strictEqual(
        err.code.match(/RequestBodyTooLarge/gi).length,
        1,
        "Did not match RequestBodyTooLarge"
      );
    }

    await tableClient.deleteTable();
  });

  // https://github.com/Azure/Azurite/issues/754
  it("Should create and delete entity using batch and PartitionKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percentBatch")
    );
    await tableClient.createTable();
    const percentPartition = "%partition";
    const testEntities: AzureDataTablesTestEntity[] = [
      createBasicEntityForTest(percentPartition),
      createBasicEntityForTest(percentPartition),
      createBasicEntityForTest(percentPartition)
    ];
    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      const result = await tableClient.submitTransaction(transaction.actions);
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed with ${err}`);
    }

    await tableClient.deleteTable();
  });

  it("Should not merge entities with request body greater than 4 MB, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: LargeDataTablesTestEntity =
      createLargeEntityForTest(partitionKey);
    testEntity.bigString01a = "";

    try {
      const result1 = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(
        result1.etag,
        null,
        "We should have created the first test entity!"
      );
      testEntity.bigString01a = testEntity.myValue.padEnd(1024 * 32, "a");
      const result2 = await tableClient.updateEntity(testEntity, "Merge");
      assert.strictEqual(
        result2.etag,
        null,
        "We should not have updated the entity!"
      );
    } catch (err: any) {
      assert.strictEqual(
        err.statusCode,
        413,
        "We did not get the expected 413 error"
      );
      assert.strictEqual(
        err.message.match(/RequestBodyTooLarge/gi).length,
        1,
        "Did not match RequestBodyTooLarge"
      );
    }

    await tableClient.deleteTable();
  });

  // https://github.com/Azure/Azurite/issues/754
  it("Should create and delete entity using batch and RowKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percentBatch")
    );
    await tableClient.createTable();
    const percentPartition = "percentRowBatch";
    const testEntities: AzureDataTablesTestEntity[] = [
      createBasicEntityForTest(percentPartition),
      createBasicEntityForTest(percentPartition),
      createBasicEntityForTest(percentPartition)
    ];
    testEntities[0].rowKey = "%" + testEntities[0].rowKey;
    testEntities[1].rowKey = "%" + testEntities[1].rowKey;
    testEntities[2].rowKey = "%" + testEntities[2].rowKey;
    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      const result = await tableClient.submitTransaction(transaction.actions);
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed with ${err}`);
    }

    await tableClient.deleteTable();
  });

  it("Should not replace entities with request body greater than 4 MB, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: LargeDataTablesTestEntity =
      createLargeEntityForTest(partitionKey);
    testEntity.bigString01a = "";

    try {
      const result1 = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(
        result1.etag,
        null,
        "We should have created the first test entity!"
      );
      testEntity.bigString01a = testEntity.myValue.padEnd(1024 * 32, "a");
      const result2 = await tableClient.updateEntity(testEntity, "Replace");
      assert.strictEqual(
        result2.etag,
        null,
        "We should not have updated the entity!"
      );
    } catch (err: any) {
      assert.strictEqual(
        err.statusCode,
        413,
        "We did not get the expected 413 error"
      );
      assert.strictEqual(
        err.message.match(/RequestBodyTooLarge/gi).length,
        1,
        "Did not match RequestBodyTooLarge"
      );
    }

    await tableClient.deleteTable();
  });

  it("should correctly insert and retrieve entities using special values using batch api", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("decodeURI")
    );
    const partitionKeyForQueryTest = createUniquePartitionKey("decode");
    await tableClient.createTable();
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    const valuesForTest = [
      "%D1%88%D0%B5%D0%BB%D0%BB%D1%8B",
      "%2B",
      "%1C",
      "\u001c",
      "Übermütige Kühe mögen Umlaute",
      "grave à et aigu é"
    ];
    let testsCompleted = 0;
    for (const valToTest of valuesForTest) {
      const testEntity: AzureDataTablesTestEntity = createBasicEntityForTest(
        partitionKeyForQueryTest
      );
      testEntity.myValue = valToTest;
      const transaction = new TableTransaction();
      transaction.createEntity(testEntity);

      try {
        const result = await tableClient.submitTransaction(transaction.actions);
        assert.ok(result.subResponses[0].rowKey);
      } catch (err: any) {
        assert.strictEqual(err, undefined, `We failed with ${err}`);
      }

      const maxPageSize = 10;

      const entities = tableClient.listEntities<AzureDataTablesTestEntity>({
        queryOptions: {
          filter: odata`(PartitionKey eq ${partitionKeyForQueryTest}) and (myValue eq ${valToTest})`
        }
      });
      let all: AzureDataTablesTestEntity[] = [];
      for await (const entity of entities.byPage({
        maxPageSize
      })) {
        all = [...all, ...entity];
      }
      assert.strictEqual(
        all.length,
        1,
        `Failed on number of results with this value ${valToTest}`
      );
      assert.strictEqual(
        all[0].myValue,
        valToTest,
        `Failed on value returned by query ${all[0].myValue} was not the same as ${valToTest}`
      );
      testsCompleted++;
    }
    assert.strictEqual(testsCompleted, valuesForTest.length);
    await tableClient.deleteTable();
  });

  it('Should create entity with RowKey containing comma ",", @loki', async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("comma")
    );
    await tableClient.createTable();
    const commaRowEntity = createBasicEntityForTest("comma");
    commaRowEntity.rowKey = "Commas,InRow,Keys";
    const insertedEntityHeaders =
      await tableClient.createEntity<AzureDataTablesTestEntity>(commaRowEntity);
    assert.notStrictEqual(
      insertedEntityHeaders.etag,
      undefined,
      "Did not create entity!"
    );

    await tableClient.deleteTable();
  });


  it("Should insert entities with null properties, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("nullable");
    const testEntity = createBasicEntityForTest(partitionKey);
    testEntity.nullableString = null;

    try {
      const result1 = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(
        result1.etag,
        null,
        "We should have created the first test entity!"
      );
    } catch (err: any) {
      assert.strictEqual(
        err.statusCode,
        413,
        "We did not get the expected 413 error"
      );
    }

    const entity: AzureDataTablesTestEntity =
      await tableClient.getEntity<AzureDataTablesTestEntity>(
        testEntity.partitionKey,
        testEntity.rowKey
      );

    assert.strictEqual(
      entity.nullableString === undefined,
      true,
      "Null property on retrieved entity should not exist!"
    );

    await tableClient.deleteTable();
  });

  // pseudo 
  // 1 create table client
  /* const tableClient = createAzureDataTablesClient(
     testLocalAzuriteInstance,
    getUniqueName("longstrings")
  );
  */

  // 2 create table 
  /* table1 = await tableClient.createTable(); 
  const partitionKey = createUniquePartitionKey("nullable");
  const testEntity = createBasicEntityForTest(partitionKey);
  testEntity.nullableString = null;
  */

  // 3 create second table?
  /* 
  table2 = await tableClient.createTable(); 
  const partitionKey = createUniquePartitionKey("nullable");
  const testEntity = createBasicEntityForTest(partitionKey);
  testEntity.nullableString = null;
  */

  // 4 delete one table 
  // await tableClient.deleteTable();  

  // 5 list table: possible to find or not?
  // GET Entity with PartitionKey= and RowKey= does not return etag in header?

  it('Should create entity with RowKey containing comma ",", @loki', async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    const partitionKey = createUniquePartitionKey("");
    const testEntity: AzureDataTablesTestEntity = 
      createBasicEntityForTest(partitionKey);

    await 

    await tableClient.createTable();
    const commaRowEntity = createBasicEntityForTest("comma");
    commaRowEntity.rowKey = "Commas,InRow,Keys";
    const insertedEntityHeaders =
      await tableClient.createEntity<AzureDataTablesTestEntity>(commaRowEntity);
    assert.notStrictEqual(
      insertedEntityHeaders.etag,
      undefined,
      "Did not create entity!"
    );

    await tableClient.deleteTable();
  });

});


