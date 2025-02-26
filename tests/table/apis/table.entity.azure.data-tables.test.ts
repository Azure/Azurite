// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import LogicAppReproEntity from "../models/table.entity.test.logicapp.entity";
import { TableTransaction } from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  AzureDataTablesTestEntityFactory,
  TableTestEntity
} from "../models/AzureDataTablesTestEntityFactory";
import {
  createAzureDataTablesClient,
  createTableServerForTestHttps,
  createUniquePartitionKey
} from "../utils/table.entity.test.utils";
import { TestBooleanPropEntity } from "../models/TestBooleanPropEntity";
import {
  LargeDataTablesTestEntityFactory,
  LargeTableTestEntity
} from "../models/LargeDataTablesTestEntityFactory";
import { AzuriteTelemetryClient } from "../../../src/common/Telemetry";
// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

const entityFactory = new AzureDataTablesTestEntityFactory();
const largeEntityFactory = new LargeDataTablesTestEntityFactory();

describe("table Entity APIs test - using Azure/data-tables", () => {
  let server: TableServer;

  before(async () => {
    server = createTableServerForTestHttps();
    await server.start();
    AzuriteTelemetryClient.init("", true, undefined);
    await AzuriteTelemetryClient.TraceStartEvent("Table Test");
  });

  after(async () => {
    await server.close();
    AzuriteTelemetryClient.TraceStopEvent("Table Test");
  });

  it("01. Batch API should return row keys in format understood by @azure/data-tables, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("dataTables")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey),
      entityFactory.createBasicEntityForTest(partitionKey)
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
  it("02. Batch API should correctly process LogicApp style update request sequence, @loki", async () => {
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

  it("03. Should return bad request error for incorrectly formatted etags, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("etags")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);

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

  it("04. Should respect Boolean property as edm string, @loki", async () => {
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
        "Did not create entity correctly, etag was null"
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
    await tableClient.deleteTable();
  });

  it("05. Should respect Int32 property as edm string, @loki", async () => {
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
        "Did not create entity correctly, etag was null"
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
    await tableClient.deleteTable();
  });

  it("06. should delete an entity with empty row and partition keys, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("empty")
    );
    const partitionKey = "";
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);
    testEntity.rowKey = "";

    await tableClient.createTable({ requestOptions: { timeout: 60000 } });
    const result = await tableClient.createEntity(testEntity);
    assert.ok(result.etag);

    const deleteResult = await tableClient.deleteEntity("", "");

    assert.notStrictEqual(deleteResult.version, undefined);
    await tableClient.deleteTable();
  });

  it("07. Should create entity with PartitionKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percent")
    );
    await tableClient.createTable();
    const percentPartitionEntity =
      entityFactory.createBasicEntityForTest("%percent");
    const insertedEntityHeaders =
      await tableClient.createEntity<TableTestEntity>(percentPartitionEntity);
    assert.notStrictEqual(
      insertedEntityHeaders.etag,
      undefined,
      "Did not create entity!"
    );

    await tableClient.deleteTable();
  });

  // https://github.com/Azure/Azurite/issues/1286
  it("08. Should update Etags with sufficient granularity, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("etags")
    );
    const etags = new Map();
    const iterations = 99;
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntities: TableTestEntity[] = [];
    const testEntity = entityFactory.createBasicEntityForTest(partitionKey);
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

  it("09. Should delete entity with PartitionKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percent")
    );
    await tableClient.createTable();
    const percentPartitionEntity =
      entityFactory.createBasicEntityForTest("%percent");
    const insertedEntityHeaders =
      await tableClient.createEntity<TableTestEntity>(percentPartitionEntity);
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

  [2, 1, 0].map((delta) => {
    it(`10. Should insert entities containing binary properties less than or equal than 64K bytes (delta ${delta}), @loki`, async () => {
      const tableClient = createAzureDataTablesClient(
        testLocalAzuriteInstance,
        getUniqueName(`longbinary${delta}`)
      );
      await tableClient.createTable();
      const partitionKey = createUniquePartitionKey("");
      const testEntity: TableTestEntity =
        entityFactory.createBasicEntityForTest(partitionKey);

      testEntity.binaryField = Buffer.alloc(64 * 1024 - delta);

      const result = await tableClient.createEntity(testEntity);
      assert.notStrictEqual(result.etag, undefined, "Did not create entity!");

      await tableClient.deleteTable();
    });
  });

  [1, 2, 3].map((delta) => {
    it(`11. Should not insert entities containing binary properties greater than 64K bytes (delta ${delta}), @loki`, async () => {
      const tableClient = createAzureDataTablesClient(
        testLocalAzuriteInstance,
        getUniqueName(`toolongbinary${delta}`)
      );
      await tableClient.createTable();
      const partitionKey = createUniquePartitionKey("");
      const testEntity: TableTestEntity =
        entityFactory.createBasicEntityForTest(partitionKey);

      testEntity.binaryField = Buffer.alloc(64 * 1024 + delta);
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

  it("12. Should not insert entities containing string properties longer than 32K chars, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);

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

  it("13. Should not merge entities containing string properties longer than 32K chars, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);

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

  it("14. Should create entity with RowKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percent")
    );
    await tableClient.createTable();
    const percentRowEntity = entityFactory.createBasicEntityForTest("percent");
    percentRowEntity.rowKey = "%" + percentRowEntity.rowKey;
    const insertedEntityHeaders =
      await tableClient.createEntity<TableTestEntity>(percentRowEntity);
    assert.notStrictEqual(
      insertedEntityHeaders.etag,
      undefined,
      "Did not create entity!"
    );

    await tableClient.deleteTable();
  });

  it("15. Should not replace entities containing string properties longer than 32K chars, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(partitionKey);

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

  it("16. Should delete entity with RowKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percent")
    );
    await tableClient.createTable();
    const percentRowEntity =
      entityFactory.createBasicEntityForTest("percentRow");
    percentRowEntity.rowKey = "%" + percentRowEntity.rowKey;
    const insertedEntityHeaders =
      await tableClient.createEntity<TableTestEntity>(percentRowEntity);
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

  it("17. Should not insert entities with request body greater than 4 MB, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: LargeTableTestEntity =
      largeEntityFactory.createLargeEntityForTest(partitionKey);

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

  it("18. Should reject batches with request body larger than 4 MB, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("bigBatch")
    );
    await tableClient.createTable();
    const partitionKey = "pk";
    const transaction = new TableTransaction();

    // Each entity is a bit over 4 * 32 * 1024 bytes.
    // This means 32 of these entities will exceed the 4 MB limit.
    for (let i = 0; i < 32; i++) {
      transaction.createEntity({
        partitionKey,
        rowKey: "rk" + i,
        a: "a".repeat(32 * 1024),
        b: "b".repeat(32 * 1024),
        c: "c".repeat(32 * 1024),
        d: "d".repeat(32 * 1024)
      });
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
  it("19. Should create and delete entity using batch and PartitionKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percentBatch")
    );
    await tableClient.createTable();
    const percentPartition = "%partition";
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition)
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

  it("20. Should not merge entities with a size greater than 1 MB, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: LargeTableTestEntity =
      largeEntityFactory.createLargeEntityForTest(partitionKey);
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
      // the service returns HTTP Status 400
      // and
      // "{\"odata.error\":{\"code\":\"EntityTooLarge\",\"message\":{\"lang\":\"en-US\",\"value\":\"The entity is larger than the maximum allowed size (1MB).\\nRequestId:fa37b1b6-e002-002e-3021-412111000000\\nTime:2023-02-15T09:37:02.4207423Z\"}}}"
      assert.strictEqual(
        err.statusCode,
        400,
        "We did not get the expected 413 error"
      );
      assert.strictEqual(
        err.message.match(/EntityTooLarge/gi).length,
        1,
        "Did not match EntityTooLarge"
      );
    }

    await tableClient.deleteTable();
  });

  // https://github.com/Azure/Azurite/issues/754
  it("21. Should create and delete entities using batch and RowKey starting with %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percentBatch")
    );
    await tableClient.createTable();
    const percentPartition = "percentRowBatch";
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition)
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

    const transaction2 = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction2.deleteEntity(testEntity.partitionKey, testEntity.rowKey);
    }
    try {
      const result2 = await tableClient.submitTransaction(transaction2.actions);
      assert.strictEqual(
        result2.subResponses[0].status,
        204,
        "We did not get status 204 on delete"
      );
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to delete with ${err}`);
    }

    await tableClient.deleteTable();
  });

  it("22. Should not replace entities with request body greater than 4 MB, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("");
    const testEntity: LargeTableTestEntity =
      largeEntityFactory.createLargeEntityForTest(partitionKey);
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
        400,
        "We did not get the expected 400 error"
      );
      assert.strictEqual(
        err.message.match(/EntityTooLarge/gi).length,
        1,
        "Did not match EntityTooLarge"
      );
    }

    await tableClient.deleteTable();
  });

  it('23. Should create entity with RowKey containing comma ",", @loki', async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("comma")
    );
    await tableClient.createTable();
    const commaRowEntity = entityFactory.createBasicEntityForTest("comma");
    commaRowEntity.rowKey = "Commas,InRow,Keys";
    const insertedEntityHeaders =
      await tableClient.createEntity<TableTestEntity>(commaRowEntity);
    assert.notStrictEqual(
      insertedEntityHeaders.etag,
      undefined,
      "Did not create entity!"
    );

    await tableClient.deleteTable();
  });

  it("24. Should insert entities with null properties, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("longstrings")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("nullable");
    const testEntity = entityFactory.createBasicEntityForTest(partitionKey);
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

    const entity: TableTestEntity =
      await tableClient.getEntity<TableTestEntity>(
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

  it("25. Should not return timestamp odata type with minimal meta data option, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("odatadate")
    );
    await tableClient.createTable();
    const partitionKey = createUniquePartitionKey("odatadate");
    const testEntity = entityFactory.createBasicEntityForTest(partitionKey);
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
        200,
        `We should not see status ${err.statusCode}!`
      );
    }

    const entity: any = await tableClient.getEntity<TableTestEntity>(
      testEntity.partitionKey,
      testEntity.rowKey,
      {
        requestOptions: {
          customHeaders: {
            accept: "application/json;odata=minimalmetadata"
          }
        }
      }
    );

    assert.strictEqual(
      typeof entity.timestamp === "string",
      true,
      "Timestamp should be string!"
    );

    await tableClient.deleteTable();
  });

  it("26. Should create, get and delete entities using batch and RowKey containing numbers and %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percentBatch")
    );
    await tableClient.createTable();
    const percentPartition = "percentRowBatch";
    const testEntities: TableTestEntity[] = [
      // { rowKey: "@r%25o%0123512512356", partitionKey: percentPartition },
      // { rowKey: "r%25131463146346", partitionKey: percentPartition },
      // { rowKey: "@r%25o%21235136314613", partitionKey: percentPartition }
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition)
    ];
    testEntities[0].rowKey = testEntities[0].rowKey.replace("row", "@r%25o%");
    testEntities[1].rowKey = testEntities[1].rowKey.replace("row", "r%25");
    testEntities[2].rowKey = testEntities[2].rowKey.replace("row", "@r%25o%");
    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      const result = await tableClient.submitTransaction(transaction.actions);
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to create with ${err}`);
    }

    // validate that we successfully created each entity,
    // and that the format of the row key was not changed by serialization
    try {
      const entity0 = await tableClient.getEntity<TableTestEntity>(
        testEntities[0].partitionKey,
        testEntities[0].rowKey
      );
      const entity1 = await tableClient.getEntity<TableTestEntity>(
        testEntities[1].partitionKey,
        testEntities[1].rowKey
      );
      const entity2 = await tableClient.getEntity<TableTestEntity>(
        testEntities[2].partitionKey,
        testEntities[2].rowKey
      );
      assert.strictEqual(entity0.rowKey, testEntities[0].rowKey);
      assert.strictEqual(entity1.rowKey, testEntities[1].rowKey);
      assert.strictEqual(entity2.rowKey, testEntities[2].rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to retrieve with ${err}`);
    }

    // now delete the entities and ensure that delete path is valid
    const transaction2 = new TableTransaction();
    transaction2.deleteEntity(
      testEntities[0].partitionKey,
      testEntities[0].rowKey
    );
    transaction2.deleteEntity(
      testEntities[1].partitionKey,
      testEntities[1].rowKey
    );
    transaction2.deleteEntity(
      testEntities[2].partitionKey,
      testEntities[2].rowKey
    );

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

    await tableClient.deleteTable();
  });

  it("27. Should create, get and delete entities using batch and PartitionKey containing numbers and %, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percentBatch")
    );
    await tableClient.createTable();
    const percentPartition = "percent%25Batch";
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition)
    ];
    testEntities[0].rowKey = testEntities[0].rowKey.replace("row", "row%");
    testEntities[1].rowKey = testEntities[1].rowKey.replace("row", "row%");
    testEntities[2].rowKey = testEntities[2].rowKey.replace("row", "r%25");
    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      const result = await tableClient.submitTransaction(transaction.actions);
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to create with ${err}`);
    }

    // validate that we successfully created each entity,
    // and that the format of the row key was not changed by serialization
    try {
      const entity0 = await tableClient.getEntity<TableTestEntity>(
        testEntities[0].partitionKey,
        testEntities[0].rowKey
      );
      const entity1 = await tableClient.getEntity<TableTestEntity>(
        testEntities[1].partitionKey,
        testEntities[1].rowKey
      );
      const entity2 = await tableClient.getEntity<TableTestEntity>(
        testEntities[2].partitionKey,
        testEntities[2].rowKey
      );
      assert.strictEqual(entity0.rowKey, testEntities[0].rowKey);
      assert.strictEqual(entity1.rowKey, testEntities[1].rowKey);
      assert.strictEqual(entity2.rowKey, testEntities[2].rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to retrieve with ${err}`);
    }

    // now delete the entities and ensure that delete path is valid
    const transaction2 = new TableTransaction();
    transaction2.deleteEntity(
      testEntities[0].partitionKey,
      testEntities[0].rowKey
    );
    transaction2.deleteEntity(
      testEntities[1].partitionKey,
      testEntities[1].rowKey
    );
    transaction2.deleteEntity(
      testEntities[2].partitionKey,
      testEntities[2].rowKey
    );

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

    await tableClient.deleteTable();
  });

  it("28. Should create, get and delete entities using batch and PartitionKey with complex form, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percentBatch")
    );
    await tableClient.createTable();
    const percentPartition =
      "@DurableTask.AzureStorage.Tests.AzureStorageScenarioTests+Orchestrations+AutoStartOrchestration+Responder";
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition)
    ];
    testEntities[0].rowKey = testEntities[0].rowKey.replace("row", "row%");
    testEntities[1].rowKey = testEntities[1].rowKey.replace("row", "row%");
    testEntities[2].rowKey = testEntities[2].rowKey.replace("row", "r%25");
    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      const result = await tableClient.submitTransaction(transaction.actions);
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to create with ${err}`);
    }

    // validate that we successfully created each entity,
    // and that the format of the row key was not changed by serialization
    try {
      const entity0 = await tableClient.getEntity(
        testEntities[0].partitionKey,
        testEntities[0].rowKey
      );
      const entity1 = await tableClient.getEntity(
        testEntities[1].partitionKey,
        testEntities[1].rowKey
      );
      const entity2 = await tableClient.getEntity(
        testEntities[2].partitionKey,
        testEntities[2].rowKey
      );
      assert.strictEqual(entity0.rowKey, testEntities[0].rowKey);
      assert.strictEqual(entity1.rowKey, testEntities[1].rowKey);
      assert.strictEqual(entity2.rowKey, testEntities[2].rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to retrieve with ${err}`);
    }

    // now delete the entities and ensure that delete path is valid
    const transaction2 = new TableTransaction();
    transaction2.deleteEntity(
      testEntities[0].partitionKey,
      testEntities[0].rowKey
    );
    transaction2.deleteEntity(
      testEntities[1].partitionKey,
      testEntities[1].rowKey
    );
    transaction2.deleteEntity(
      testEntities[2].partitionKey,
      testEntities[2].rowKey
    );

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

    await tableClient.deleteTable();
  });

  // https://github.com/Azure/Azurite/issues/1481
  it("29. Should create, get and delete entities using RowKey containing apostrophe, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("apostrophe")
    );
    await tableClient.createTable();
    const percentPartition = "percentRowBatch";
    const testEntity: TableTestEntity =
      entityFactory.createBasicEntityForTest(percentPartition);

    testEntity.rowKey = testEntity.rowKey.replace("row", "O'");

    try {
      const result = await tableClient.createEntity(testEntity);
      assert.ok(result.etag);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to create with ${err}`);
    }

    // validate that we successfully created each entity,
    // and that the format of the row key was not changed by serialization
    try {
      const entity0 = await tableClient.getEntity<TableTestEntity>(
        testEntity.partitionKey,
        testEntity.rowKey
      );

      assert.strictEqual(entity0.rowKey, testEntity.rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to retrieve with ${err}`);
    }

    // now delete the entity and ensure that delete path is valid
    try {
      const result = await tableClient.deleteEntity(
        testEntity.partitionKey,
        testEntity.rowKey
      );
      assert.notStrictEqual(result, undefined);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to delete with ${err}`);
    }

    // check that deleted entity is gone
    try {
      const entity1 = await tableClient.getEntity<TableTestEntity>(
        testEntity.partitionKey,
        testEntity.rowKey
      );
      assert.strictEqual(entity1, undefined);
    } catch (err: any) {
      assert.strictEqual(
        err.statusCode,
        404,
        `We should failed to retrieve with ResourceNotFound, but got ${err}`
      );
    }

    await tableClient.deleteTable();
  });

  it("30. Should create, get and delete entities using batch and RowKey containing apostrophe, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("percentBatch")
    );
    await tableClient.createTable();
    const percentPartition = "percentRowBatch";
    const testEntities: TableTestEntity[] = [
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition),
      entityFactory.createBasicEntityForTest(percentPartition)
    ];
    testEntities[0].rowKey = testEntities[0].rowKey.replace("row", "O'");
    testEntities[1].rowKey = testEntities[1].rowKey.replace("row", "O'");
    testEntities[2].rowKey = testEntities[2].rowKey.replace("row", "O'");
    const transaction = new TableTransaction();
    for (const testEntity of testEntities) {
      transaction.createEntity(testEntity);
    }

    try {
      const result = await tableClient.submitTransaction(transaction.actions);
      assert.ok(result.subResponses[0].rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to create with ${err}`);
    }

    // validate that we successfully created each entity,
    // and that the format of the row key was not changed by serialization
    try {
      const entity0 = await tableClient.getEntity<TableTestEntity>(
        testEntities[0].partitionKey,
        testEntities[0].rowKey
      );
      const entity1 = await tableClient.getEntity<TableTestEntity>(
        testEntities[1].partitionKey,
        testEntities[1].rowKey
      );
      const entity2 = await tableClient.getEntity<TableTestEntity>(
        testEntities[2].partitionKey,
        testEntities[2].rowKey
      );
      assert.strictEqual(entity0.rowKey, testEntities[0].rowKey);
      assert.strictEqual(entity1.rowKey, testEntities[1].rowKey);
      assert.strictEqual(entity2.rowKey, testEntities[2].rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to retrieve with ${err}`);
    }

    // now delete the entities and ensure that delete path is valid
    const transaction2 = new TableTransaction();
    transaction2.deleteEntity(
      testEntities[0].partitionKey,
      testEntities[0].rowKey
    );
    transaction2.deleteEntity(
      testEntities[1].partitionKey,
      testEntities[1].rowKey
    );
    transaction2.deleteEntity(
      testEntities[2].partitionKey,
      testEntities[2].rowKey
    );

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

    await tableClient.deleteTable();
  });

  // https://github.com/Azure/Azurite/issues/1958
  it("31. Should create, get and delete entities using Azure Data Tables SDK batch merge operation, @loki", async () => {
    const tableClient = createAzureDataTablesClient(
      testLocalAzuriteInstance,
      getUniqueName("issue1958")
    );
    try {
      await tableClient.createTable();
    } catch (createErr) {
      assert.strictEqual(
        createErr,
        undefined,
        `We failed to create with ${createErr}`
      );
    }
    const issue1958 = "issue1958";
    const testEntities: { partitionKey: string; rowKey: string }[] = [
      {
        partitionKey: issue1958,
        rowKey: "c8b06c47-c755-4b53-b3da-73949ebbb24f"
      },
      {
        partitionKey: issue1958,
        rowKey: "c8b06c47-c755-4b53-b3da-73949ebbb24e"
      }
    ];
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
      assert.strictEqual(result.subResponses.length, 2);
      assert.strictEqual(result.subResponses[0].status, 204);
      assert.strictEqual(result.subResponses[1].status, 204);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to create with ${err}`);
    }

    // validate that we successfully created each entity,
    // and that the format of the row key was not changed by serialization
    try {
      const entity0 = await tableClient.getEntity<TableTestEntity>(
        testEntities[0].partitionKey,
        testEntities[0].rowKey
      );
      const entity1 = await tableClient.getEntity<TableTestEntity>(
        testEntities[1].partitionKey,
        testEntities[1].rowKey
      );
      assert.strictEqual(entity0.rowKey, testEntities[0].rowKey);
      assert.strictEqual(entity1.rowKey, testEntities[1].rowKey);
    } catch (err: any) {
      assert.strictEqual(err, undefined, `We failed to retrieve with ${err}`);
    }

    // now delete the entities and ensure that delete path is valid
    const transaction2 = new TableTransaction();
    transaction2.deleteEntity(
      testEntities[0].partitionKey,
      testEntities[0].rowKey
    );
    transaction2.deleteEntity(
      testEntities[1].partitionKey,
      testEntities[1].rowKey
    );

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

    await tableClient.deleteTable();
  });
});
