import * as assert from "assert";
import { configLogger } from "../../../src/common/Logger";

import TableServer from "../../../src/table/TableServer";
import { getUniqueName, restoreBuildRequestOptions } from "../../testutils";
import {
  createConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";
import { TestEntity } from "../models/TestEntity";
import { AzureStorageSDKEntityFactory } from "../utils/AzureStorageSDKEntityFactory";
import { TableClient, TableTransaction } from "@azure/data-tables";
import type { FullOperationResponse } from "@azure/core-client";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

const entityFactory = new AzureStorageSDKEntityFactory();

describe("table Entity APIs test - using Azure-Storage", () => {
  let server: TableServer;
  let tableName: string = getUniqueName("table");
  const tableService = TableClient.fromConnectionString(
    createConnectionStringForTest(testLocalAzuriteInstance),
    tableName,
    { allowInsecureConnection: true }
  );
  // ToDo: added due to problem with batch responses not finishing properly - Need to investigate batch response
  before(async () => {
    server = createTableServerForTest();
    tableName = getUniqueName("table");
    await server.start();

    // we need to await here as we now also test against the service
    // which is not as fast as our in memory DBs
    try {
      await tableService.createTable();
    } catch (createError) {
      throw new Error("failed to create table");
    }
  });

  after(async () => {
    restoreBuildRequestOptions(tableService);
    await server?.close();
  });

  // Simple test in here until we have the full set checked in, as we need
  // a starting point for delete and query entity APIs
  it("01. Should insert new Entity, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity
    const entity = entityFactory.createBasicEntityForTest();

    const result = await tableService.createEntity<TestEntity>(entity);

    if (result.etag !== undefined) {
      const matches = result.etag.match(
        "W/\"datetime'\\d{4}-\\d{2}-\\d{2}T\\d{2}%3A\\d{2}%3A\\d{2}.\\d{7}Z'\""
      );
      assert.notStrictEqual(matches, undefined, "Unable to validate etag");
    }
    assert.notStrictEqual(
      result,
      undefined,
      "did not get expected result object"
    );
  });

  // Insert entity property with type "Edm.DateTime", server will convert to UTC time
  it("02. Insert new Entity property with type Edm.DateTime will convert to UTC, @loki", async () => {
    const timeValue = "2012-01-02T23:00:00";
    const entity = {
      partitionKey: "part1",
      rowKey: "utctest",
      myValue: timeValue,
      "myValue@odata.type": "Edm.DateTime"
    };

    await tableService.createEntity(entity);
    const insertedEntity = await tableService.getEntity<TestEntity>(
      "part1",
      "utctest"
    );

    assert.strictEqual(
      insertedEntity.myValue.toString(),
      new Date(timeValue + "Z").toString()
    );
  });

  // Insert empty entity property with type "Edm.DateTime", server will return error
  it("03. Insert new Entity property with type Edm.DateTime will convert to UTC, @loki", async () => {
    const timeValue = "";
    const entity = {
      partitionKey: "part1",
      rowKey: "utctest",
      myValue: timeValue,
      "myValue@odata.type": "Edm.DateTime"
    };

    try {
      await tableService.createEntity(entity);
      assert.fail(
        "Insert should fail with DataTime type property has empty value."
      );
    } catch (error) {
      assert.strictEqual(
        true,
        error.details.odataError.message.value.startsWith(
          "An error occurred while processing this request."
        )
      );
    }
  });

  // Simple test in here until we have the full set checked in, as we need
  // a starting point for delete and query entity APIs
  it("04. Should insert new Entity with empty RowKey, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity
    const entity = entityFactory.createBasicEntityForTest();
    entity.rowKey = "";
    const result = await tableService.createEntity<TestEntity>(entity);

    const matches = result.etag?.match(
      "W/\"datetime'\\d{4}-\\d{2}-\\d{2}T\\d{2}%3A\\d{2}%3A\\d{2}.\\d{7}Z'\""
    );

    assert.notStrictEqual(matches, undefined, "Unable to validate etag");
  });

  it("05. Should retrieve entity with empty RowKey, @loki", async () => {
    const entityInsert = entityFactory.createBasicEntityForTest();
    entityInsert.rowKey = "";
    entityInsert.myValue = getUniqueName("uniqueValue");
    await tableService.upsertEntity(entityInsert);
    const queryResult = await tableService.getEntity<TestEntity>(
      entityInsert.partitionKey,
      ""
    );

    assert.strictEqual(queryResult.myValue, entityInsert.myValue);
  });

  it("06. Should delete an Entity using etag wildcard, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1

    const entity = entityFactory.createBasicEntityForTest();
    await tableService.createEntity<TestEntity>(entity);

    /* https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1#request-headers
        If-Match	Required. The client may specify the ETag for the entity on the request in
        order to compare to the ETag maintained by the service for the purpose of optimistic concurrency.
        The delete operation will be performed only if the ETag sent by the client matches the value
        maintained by the server, indicating that the entity has not been modified since it was retrieved by the client.
        To force an unconditional delete, set If-Match to the wildcard character (*). */
    await tableService.deleteEntity(entity.partitionKey, entity.rowKey, {
      etag: "*"
    });
  });

  it("07. Should not delete an Entity not matching Etag, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entityInsert = entityFactory.createBasicEntityForTest();
    const insertResult = await tableService.createEntity(entityInsert);
    insertResult.etag = insertResult.etag?.replace("20", "21"); // test will be valid for 100 years... if it causes problems then, I shall be very proud
    try {
      await tableService.deleteEntity(
        entityInsert.partitionKey,
        entityInsert.rowKey,
        {
          etag: insertResult.etag
        }
      );
      assert.fail("updated with incorrect etag");
    } catch (_) {
      /* test success */
    }
  });

  it("08. Should delete a matching Etag, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entityInsert = entityFactory.createBasicEntityForTest();
    const result = await tableService.createEntity(entityInsert);
    await tableService.deleteEntity(
      entityInsert.partitionKey,
      entityInsert.rowKey,
      result // SDK defined entity type...
    );
  });

  it("09. Update an Entity that exists, @loki", async () => {
    const entityInsert = entityFactory.createBasicEntityForTest();
    await tableService.createEntity(entityInsert);
    await tableService.updateEntity({
      partitionKey: entityInsert.partitionKey,
      rowKey: entityInsert.rowKey,
      myValue: "newValue"
    });
  });

  it("10. Upserts when an Entity does not exist using updateEntity(), @loki", async () => {
    const entityToUpdate = entityFactory.createBasicEntityForTest();
    // this is submitting an update with if-match == *
    try {
      await tableService.updateEntity(entityToUpdate);
      assert.fail("Test should have thrown an error");
    } catch (error) {
      assert.strictEqual(error.statusCode, 404);
    }
  });

  it("11. Should not update an Entity not matching Etag, @loki", async () => {
    const entityInsert = entityFactory.createBasicEntityForTest();
    const insertResult = await tableService.createEntity(entityInsert);
    try {
      // test will be valid for 100 years... if it causes problems then, I shall be very proud
      await tableService.updateEntity(entityInsert, "Replace", {
        etag: insertResult.etag?.replace("20", "21")
      });
      assert.fail("updated with incorrect etag");
    } catch (updateError) {
      const castUpdateStatusCode = updateError.statusCode;
      assert.strictEqual(castUpdateStatusCode, 412); // Precondition failed
    }
  });

  it("12. Should update, if Etag matches, @loki", async () => {
    const entityTemplate = entityFactory.createBasicEntityForTest();
    const entityInsert = {
      partitionKey: entityTemplate.partitionKey,
      rowKey: entityTemplate.rowKey,
      myValue: "oldValue"
    };

    const result = await tableService.createEntity(entityInsert);
    const etagOld = result.etag;
    const entityUpdate = {
      partitionKey: entityTemplate.partitionKey,
      rowKey: entityTemplate.rowKey,
      myValue: "oldValueUpdate"
    };
    await tableService.updateEntity(entityUpdate, "Replace", { etag: etagOld });
  });

  // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-or-replace-entity
  it("13. Insert or Replace (upsert) on an Entity that does not exist, @loki", async () => {
    const entityToInsert = entityFactory.createBasicEntityForTest();
    await tableService.upsertEntity(entityToInsert, "Replace");
    const result = await tableService.getEntity<TestEntity>(
      entityToInsert.partitionKey,
      entityToInsert.rowKey
    );
    assert.strictEqual(
      result.myValue,
      entityToInsert.myValue,
      "Value was incorrect on retrieved entity"
    );
  });

  // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-or-replace-entity
  it("14. Insert or Replace (upsert) on an Entity that exists, @loki", async () => {
    const upsertEntity = entityFactory.createBasicEntityForTest();
    tableService.createEntity(upsertEntity);
    upsertEntity.myValue = "updated";
    await tableService.upsertEntity(upsertEntity, "Replace");

    const result = await tableService.getEntity<TestEntity>(
      upsertEntity.partitionKey,
      upsertEntity.rowKey
    );
    assert.strictEqual(
      result.myValue,
      upsertEntity.myValue,
      "Value was incorrect on retrieved entity"
    );
  });

  // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-or-merge-entity
  it("15. Insert or Merge on an Entity that exists, @loki", async () => {
    const entityInsert = entityFactory.createBasicEntityForTest();
    await tableService.createEntity(entityInsert);
    entityInsert.myValue = "new value";

    await tableService.upsertEntity(entityInsert, "Merge");
    const result = await tableService.getEntity<TestEntity>(
      entityInsert.partitionKey,
      entityInsert.rowKey
    );
    assert.strictEqual(
      result.myValue,
      entityInsert.myValue,
      "Value was incorrect on retrieved entity"
    );
  });

  it("16. Insert or Merge on an Entity that does not exist, @loki", async () => {
    const entityToInsertOrMerge = entityFactory.createBasicEntityForTest();
    await tableService.upsertEntity(entityToInsertOrMerge);

    const result = await tableService.getEntity<TestEntity>(
      entityToInsertOrMerge.partitionKey,
      entityToInsertOrMerge.rowKey
    );
    assert.strictEqual(
      result.myValue,
      entityToInsertOrMerge.myValue,
      "Inserted value did not match"
    );
  });

  // // Start of Batch Tests:
  it("17. Simple Insert Or Replace of a SINGLE entity as a BATCH, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();

    const entityBatch = new TableTransaction();
    entityBatch.upsertEntity(batchEntity1, "Replace");

    await tableService.submitTransaction(entityBatch.actions);
    const entity: TestEntity = await tableService.getEntity<TestEntity>(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );
    assert.strictEqual(entity.myValue, batchEntity1.myValue);
  });

  [
    { pk: "pk", rk: "rk", label: "normal partition key and row key" },
    { pk: "", rk: "rk", label: "empty partition key" },
    { pk: "pk", rk: "", label: "empty row key" }
  ].forEach(({ pk, rk, label }) => {
    it(`18. create entity with ${label} in a BATCH, @loki`, async () => {
      const batchEntity1 = new TestEntity(
        !pk ? pk : getUniqueName(pk),
        !rk ? rk : getUniqueName(rk),
        "value1"
      );

      const entityBatch = new TableTransaction();
      entityBatch.createEntity(batchEntity1);

      await tableService.submitTransaction(entityBatch.actions);

      const entity = await tableService.getEntity<TestEntity>(
        batchEntity1.partitionKey,
        batchEntity1.rowKey
      );
      assert.strictEqual(entity.myValue, batchEntity1.myValue);
    });

    it(`18. upsert merge entity with ${label} in a BATCH, @loki`, async () => {
      const batchEntity1 = new TestEntity(
        !pk ? pk : getUniqueName(pk),
        !rk ? rk : getUniqueName(rk),
        "value1"
      );

      const entityBatch = new TableTransaction();
      entityBatch.upsertEntity(batchEntity1, "Merge");

      await tableService.submitTransaction(entityBatch.actions);

      const entity = await tableService.getEntity<TestEntity>(
        batchEntity1.partitionKey,
        batchEntity1.rowKey
      );
      assert.strictEqual(entity.myValue, batchEntity1.myValue);
    });

    it(`18. upsert replace entity with ${label} in a BATCH, @loki`, async () => {
      const batchEntity1 = new TestEntity(
        !pk ? pk : getUniqueName(pk),
        !rk ? rk : getUniqueName(rk),
        "value1"
      );

      const entityBatch = new TableTransaction();
      entityBatch.upsertEntity(batchEntity1, "Replace");

      await tableService.submitTransaction(entityBatch.actions);

      const entity = await tableService.getEntity<TestEntity>(
        batchEntity1.partitionKey,
        batchEntity1.rowKey
      );
      assert.strictEqual(entity.myValue, batchEntity1.myValue);
    });

    it(`19. update merge of entity with ${label} in a BATCH, @loki`, async () => {
      const batchEntity1 = new TestEntity(
        !pk ? pk : getUniqueName(pk),
        !rk ? rk : getUniqueName(rk),
        "value1"
      );

      await tableService.createEntity(batchEntity1);
      const entityBatch = new TableTransaction();
      entityBatch.updateEntity(batchEntity1, "Merge");

      await tableService.submitTransaction(entityBatch.actions);
    });
    it(`19. update replace of entity with ${label} in a BATCH, @loki`, async () => {
      const batchEntity1 = new TestEntity(
        !pk ? pk : getUniqueName(pk),
        !rk ? rk : getUniqueName(rk),
        "value1"
      );

      await tableService.createEntity(batchEntity1);
      const entityBatch = new TableTransaction();
      entityBatch.updateEntity(batchEntity1, "Replace");

      await tableService.submitTransaction(entityBatch.actions);
    });

    it("20. DELETE of entity with ${label} in a BATCH, @loki", async () => {
      const batchEntity1 = new TestEntity(
        !pk ? pk : getUniqueName(pk),
        !rk ? rk : getUniqueName(rk),
        "value1"
      );

      await tableService.createEntity(batchEntity1);
      const entityBatch = new TableTransaction();
      entityBatch.deleteEntity(batchEntity1.partitionKey, batchEntity1.rowKey);

      await tableService.submitTransaction(entityBatch.actions);
      try {
        await tableService.getEntity<TestEntity>(
          batchEntity1.partitionKey,
          batchEntity1.rowKey
        );
        assert.fail("retrieved deleted");
      } catch (_) {
        /* success */
      }
    });
  });

  it("21. Simple batch test: Inserts multiple entities as a batch, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();
    const batchEntity2 = entityFactory.createBasicEntityForTest();
    const batchEntity3 = entityFactory.createBasicEntityForTest();

    const entityBatch = new TableTransaction();
    entityBatch.createEntity(batchEntity1);
    entityBatch.createEntity(batchEntity2);
    entityBatch.createEntity(batchEntity3);

    await tableService.submitTransaction(entityBatch.actions);
    // Now that QueryEntity is done - validate Entity Properties as follows:
    const entity: TestEntity = await tableService.getEntity<TestEntity>(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );
    assert.strictEqual(entity.myValue, batchEntity1.myValue);
  });

  it("22. Simple batch test: Delete multiple entities as a batch, @loki", async () => {
    // First insert multiple entities to delete
    const batchEntity1 = entityFactory.createBasicEntityForTest();
    const batchEntity2 = entityFactory.createBasicEntityForTest();
    const batchEntity3 = entityFactory.createBasicEntityForTest();

    const createEntityBatch = new TableTransaction();
    createEntityBatch.createEntity(batchEntity1);
    createEntityBatch.createEntity(batchEntity2);
    createEntityBatch.createEntity(batchEntity3);

    const deleteEntityBatch = new TableTransaction();
    deleteEntityBatch.deleteEntity(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );
    deleteEntityBatch.deleteEntity(
      batchEntity2.partitionKey,
      batchEntity2.rowKey
    );
    deleteEntityBatch.deleteEntity(
      batchEntity3.partitionKey,
      batchEntity3.rowKey
    );

    await tableService.submitTransaction(createEntityBatch.actions);

    // Now that QueryEntity is done - validate Entity Properties as follows:
    const entity: TestEntity = await tableService.getEntity<TestEntity>(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );
    assert.strictEqual(entity.myValue, batchEntity1.myValue);

    // now that we have confirmed that our test entities are created, we can try to delete them
    await tableService.submitTransaction(deleteEntityBatch.actions);

    // Now that QueryEntity is done - validate Entity Properties as follows:
    try {
      tableService.getEntity<TestEntity>(
        batchEntity1.partitionKey,
        batchEntity1.rowKey
      );
      assert.fail("Could retrieve deleted entity!");
    } catch (_) {
      /* test success */
    }
  });

  it("23. Insert Or Replace multiple entities as a batch, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();
    const batchEntity2 = entityFactory.createBasicEntityForTest();
    const batchEntity3 = entityFactory.createBasicEntityForTest();

    const entityBatch = new TableTransaction();
    entityBatch.upsertEntity(batchEntity1, "Replace");
    entityBatch.upsertEntity(batchEntity2, "Replace");
    entityBatch.upsertEntity(batchEntity3, "Replace");

    await tableService.submitTransaction(entityBatch.actions);
    const entity: TestEntity = await tableService.getEntity<TestEntity>(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(entity.myValue, batchEntity1.myValue);
  });

  it("24. Insert Or Merge multiple entities as a batch, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();
    const batchEntity2 = entityFactory.createBasicEntityForTest();
    const batchEntity3 = entityFactory.createBasicEntityForTest();

    const entityBatch = new TableTransaction();
    entityBatch.upsertEntity(batchEntity1, "Merge");
    entityBatch.upsertEntity(batchEntity2, "Merge");
    entityBatch.upsertEntity(batchEntity3, "Merge");

    await tableService.submitTransaction(entityBatch.actions);
    const entity: TestEntity = await tableService.getEntity<TestEntity>(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(entity.myValue, batchEntity1.myValue);
  });

  it("25. Insert and Update entity via a batch, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();

    await tableService.createEntity(batchEntity1);
    const batchEntity2 = entityFactory.createBasicEntityForTest();
    const entityBatch = new TableTransaction();
    entityBatch.createEntity(batchEntity2);
    batchEntity1.myValue = "value2";
    entityBatch.updateEntity(batchEntity1);

    await tableService.submitTransaction(entityBatch.actions);

    const entity: TestEntity = await tableService.getEntity<TestEntity>(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(entity.myValue, batchEntity1.myValue);
  });

  it("26. Insert and Merge entity via a batch, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();

    await tableService.createEntity(batchEntity1);
    const batchEntity2 = entityFactory.createBasicEntityForTest();
    const entityBatch = new TableTransaction();
    entityBatch.createEntity(batchEntity2);
    batchEntity1.myValue = "value2";
    entityBatch.updateEntity(batchEntity1, "Merge");

    await tableService.submitTransaction(entityBatch.actions);

    const entity: TestEntity = await tableService.getEntity<TestEntity>(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(entity.myValue, batchEntity1.myValue);
  });

  it("27. Insert and Delete entity via a batch, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();
    await tableService.createEntity(batchEntity1);

    const batchEntity2 = entityFactory.createBasicEntityForTest();

    const entityBatch = new TableTransaction();
    entityBatch.createEntity(batchEntity2);
    entityBatch.deleteEntity(batchEntity1.partitionKey, batchEntity1.rowKey);

    await tableService.submitTransaction(entityBatch.actions);
    try {
      await tableService.getEntity<TestEntity>(
        batchEntity1.partitionKey,
        batchEntity1.rowKey
      );
      assert.fail("retrieved deleted entity");
    } catch (_) {
      /* test success */
    }
  });

  it("29. Single Delete entity via a batch, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();

    await tableService.createEntity<TestEntity>(batchEntity1);

    const entityBatch = new TableTransaction();
    entityBatch.deleteEntity(batchEntity1.partitionKey, batchEntity1.rowKey);

    await tableService.submitTransaction(entityBatch.actions);

    try {
      tableService.getEntity<TestEntity>(
        batchEntity1.partitionKey,
        batchEntity1.rowKey
      );
      assert.fail("Could retrieve deleted entity!");
    } catch (_) {
      /* test success */
    }
  });

  // this covers the following issues
  // https://github.com/Azure/Azurite/issues/750
  // https://github.com/Azure/Azurite/issues/733
  // https://github.com/Azure/Azurite/issues/745
  it("30. Operates on batch items with complex row keys, @loki", async () => {
    const createEntity1 = entityFactory.createBasicEntityForTest();
    createEntity1.rowKey = "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0B";
    const createEntity2 = entityFactory.createBasicEntityForTest();
    createEntity2.rowKey = "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0C";
    const createEntity3 = entityFactory.createBasicEntityForTest();
    createEntity3.rowKey = "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0D";
    const createEntity4 = entityFactory.createBasicEntityForTest();
    createEntity4.rowKey = "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0E";

    await tableService.createEntity<TestEntity>(createEntity1);
    await tableService.createEntity<TestEntity>(createEntity2);
    const entityBatch = new TableTransaction();
    entityBatch.createEntity(createEntity3);
    entityBatch.createEntity(createEntity4);
    entityBatch.deleteEntity(createEntity1.partitionKey, createEntity1.rowKey);
    entityBatch.deleteEntity(createEntity2.partitionKey, createEntity2.rowKey);

    await tableService.submitTransaction(entityBatch.actions);

    await tableService.getEntity<TestEntity>(
      createEntity3.partitionKey,
      createEntity3.rowKey
    );

    await tableService.getEntity<TestEntity>(
      createEntity4.partitionKey,
      createEntity4.rowKey
    );

    try {
      await tableService.getEntity<TestEntity>(
        createEntity1.partitionKey,
        createEntity1.rowKey
      );
      assert.fail("retrieved deleted entity");
    } catch (_) {
      /* success */
    }
    try {
      await tableService.getEntity<TestEntity>(
        createEntity2.partitionKey,
        createEntity2.rowKey
      );
      assert.fail("retrieved deleted entity");
    } catch (_) {
      /* success */
    }
  });

  // this covers https://github.com/Azure/Azurite/issues/741
  it("31. Operates on batch items with complex partition keys, @loki", async () => {
    const createEntity1 = entityFactory.createBasicEntityForTest();
    createEntity1.partitionKey =
      "@DurableTask.AzureStorage.Tests.AzureStorageScenarioTests+Orchestrations+AutoStartOrchestration+Responder";
    const createEntity2 = entityFactory.createBasicEntityForTest();
    createEntity2.partitionKey =
      "@DurableTask.AzureStorage.Tests.AzureStorageScenarioTests+Orchestrations+AutoStartOrchestration+Responder";
    const createEntity3 = entityFactory.createBasicEntityForTest();
    createEntity3.partitionKey =
      "@DurableTask.AzureStorage.Tests.AzureStorageScenarioTests+Orchestrations+AutoStartOrchestration+Responder";
    const createEntity4 = entityFactory.createBasicEntityForTest();
    createEntity4.partitionKey =
      "@DurableTask.AzureStorage.Tests.AzureStorageScenarioTests+Orchestrations+AutoStartOrchestration+Responder";

    await tableService.createEntity<TestEntity>(createEntity1);
    await tableService.createEntity<TestEntity>(createEntity2);
    const entityBatch = new TableTransaction();
    entityBatch.createEntity(createEntity3);
    entityBatch.createEntity(createEntity4);
    entityBatch.deleteEntity(createEntity1.partitionKey, createEntity1.rowKey);
    entityBatch.deleteEntity(createEntity2.partitionKey, createEntity2.rowKey);
    await tableService.submitTransaction(entityBatch.actions);

    await tableService.getEntity<TestEntity>(
      createEntity3.partitionKey,
      createEntity3.rowKey
    );
    await tableService.getEntity<TestEntity>(
      createEntity4.partitionKey,
      createEntity4.rowKey
    );
    try {
      await tableService.getEntity<TestEntity>(
        createEntity1.partitionKey,
        createEntity1.rowKey
      );
      assert.fail("retrieved deleted entity");
    } catch (_) {
      /* success */
    }
    try {
      await tableService.getEntity<TestEntity>(
        createEntity2.partitionKey,
        createEntity2.rowKey
      );
      assert.fail("retrieved deleted entity");
    } catch (_) {
      /* success */
    }
  });

  it("32. Ensure Valid Etag format from Batch, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();

    tableService.createEntity<TestEntity>(batchEntity1);
    const batchEntity2 = entityFactory.createBasicEntityForTest();
    const entityBatch = new TableTransaction();
    entityBatch.createEntity(batchEntity2);
    batchEntity1.myValue = "value2";
    entityBatch.updateEntity(batchEntity1, "Merge");

    await tableService.submitTransaction(entityBatch.actions);

    let response: FullOperationResponse | undefined;
    const entity: TestEntity = await tableService.getEntity<TestEntity>(
      batchEntity1.partitionKey,
      batchEntity1.rowKey,
      { onResponse: (rawResponse) => (response = rawResponse) }
    );
    assert.strictEqual(entity.myValue, batchEntity1.myValue);

    if (response !== null) {
      assert.notStrictEqual(response, null, "response empty");
      if (response != null) {
        assert.strictEqual(
          response.parsedBody["odata.etag"].match(/(%3A)/).length,
          2,
          "did not find the expected number of escaped sequences"
        );
      }
    }
  });

  it("34. Can create entities with empty string for row and partition key, @loki", async () => {
    const emptyKeysEntity = entityFactory.createBasicEntityForTest();
    emptyKeysEntity.partitionKey = "";
    emptyKeysEntity.rowKey = "";

    await tableService.createEntity<TestEntity>(emptyKeysEntity);

    const entity: TestEntity = await tableService.getEntity<TestEntity>("", "");
    assert.strictEqual(entity.myValue, emptyKeysEntity.myValue);
  });

  it("35. Operates on batch items with partition keys with %25 in the middle, @loki", async () => {
    const createEntity1 = entityFactory.createBasicEntityForTest();
    createEntity1.partitionKey = "percent2%25batch";
    const createEntity2 = entityFactory.createBasicEntityForTest();
    createEntity2.partitionKey = "percent2%25batch";
    const createEntity3 = entityFactory.createBasicEntityForTest();
    createEntity3.partitionKey = "percent2%25batch";
    const createEntity4 = entityFactory.createBasicEntityForTest();
    createEntity4.partitionKey = "percent2%25batch";

    tableService.createEntity<TestEntity>(createEntity1);
    tableService.createEntity<TestEntity>(createEntity2);
    const entityBatch = new TableTransaction();
    entityBatch.createEntity(createEntity3);
    entityBatch.createEntity(createEntity4);
    entityBatch.deleteEntity(createEntity1.partitionKey, createEntity1.rowKey);
    entityBatch.deleteEntity(createEntity2.partitionKey, createEntity2.rowKey);
    await tableService.submitTransaction(entityBatch.actions);
    await tableService.getEntity<TestEntity>(
      createEntity3.partitionKey,
      createEntity3.rowKey
    );
    await tableService.getEntity<TestEntity>(
      createEntity4.partitionKey,
      createEntity4.rowKey
    );

    try {
      await tableService.getEntity<TestEntity>(
        createEntity1.partitionKey,
        createEntity1.rowKey
      );
      assert.fail("retrieved deleted entity");
    } catch (_) {
      /* success */
    }
    try {
      await tableService.getEntity<TestEntity>(
        createEntity2.partitionKey,
        createEntity2.rowKey
      );
      assert.fail("retrieved deleted entity");
    } catch (_) {
      /* success */
    }
  });

  it("36. Merge on an Entity with single quote in PartitionKey and RowKey, @loki", async () => {
    const partitionKey = "pk single'quota string";
    const rowKey = "rk single'quota string";

    // Insert entity with the specific pk,rk
    const entityInsert = new TestEntity(partitionKey, rowKey, "value1");
    await tableService.createEntity(entityInsert);
    const entityMerge = new TestEntity(partitionKey, rowKey, "value2");
    await tableService.updateEntity(entityMerge, "Merge");

    // retrieve entity with the specific pk,rk, and validate value is updated
    const result = await tableService.getEntity<TestEntity>(
      partitionKey,
      rowKey
    );
    assert.strictEqual(result.partitionKey, partitionKey);
    assert.strictEqual(result.rowKey, rowKey);
    assert.strictEqual(result.myValue, "value2");
  });

  // for github issue #1536
  it("37. Should drop etag property when inserting entity, @loki", async () => {
    const dropEtagPKey = getUniqueName("drop");
    const rowKey1 = getUniqueName("rk1");
    const entityInsert = new TestEntity(dropEtagPKey, rowKey1, "value");
    await tableService.createEntity(entityInsert);

    const queryResult = await tableService.getEntity<TestEntity>(
      entityInsert.partitionKey,
      entityInsert.rowKey
    );
    assert.strictEqual(queryResult.myValue, entityInsert.myValue);
    // now add odata etag property to the entity
    const entityWithEtag = queryResult;
    const rowKey2 = getUniqueName("rk2");
    entityWithEtag.rowKey = rowKey2;
    (entityWithEtag as any)["odata.etag"] =
      "W/\"datetime'2021-06-30T00%3A00%3A00.0000000Z'\"";
    tableService.createEntity(entityWithEtag);

    let response: FullOperationResponse | undefined;
    const query2Result = await tableService.getEntity<TestEntity>(
      entityWithEtag.partitionKey,
      entityWithEtag.rowKey,
      { onResponse: (rawResponse) => (response = rawResponse) }
    );
    assert.strictEqual(query2Result.myValue, entityInsert.myValue);
    assert.notDeepStrictEqual(
      response?.parsedHeaders?.etag,
      "W/\"datetime'2021-06-30T00%3A00%3A00.0000000Z'\"",
      "Etag value is not writable and should be dropped."
    );
  });

  // For github issue 2387
  // Insert entity property with type "Edm.Double" and value bigger than MAX_VALUE, server will fail the request
  it("38. Insert entity with Edm.Double type property whose value is bigger than MAX_VALUE, server will fail the request, @loki", async () => {
    // Double value bigger than MAX_VALUE will fail
    const entity1 = {
      partitionKey: "partDouble",
      rowKey: "utctestDouble",
      myValue: "1.797693134862316e308",
      "myValue@odata.type": "Edm.Double"
    };

    try {
      await tableService.createEntity(entity1);
      assert.fail(
        "Insert should fail with Edm.Double type property whose value is greater than MAX_VALUE."
      );
    } catch (error) {
      assert.strictEqual(
        true,
        error.details.odataError.message.value.startsWith(
          "An error occurred while processing this request."
        )
      );
    }

    // Double value smaller than MAX_VALUE will success
    const entity2 = {
      partitionKey: "partDouble",
      rowKey: "utctestDouble",
      myValue: "1.797693134862315e308",
      "myValue@odata.type": "Edm.Double"
    };

    await tableService.createEntity(entity2);
    const insertedEntity: TestEntity = await tableService.getEntity<TestEntity>(
      "partDouble",
      "utctestDouble"
    );
    assert.strictEqual(
      insertedEntity.myValue.toString(),
      "1.797693134862315e+308"
    );
  });
});
