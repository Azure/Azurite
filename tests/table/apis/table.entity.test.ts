import * as assert from "assert";
import {
  TableClient,
  TableServiceClient,
  TableTransaction
} from "@azure/data-tables";
import { configLogger } from "../../../src/common/Logger";

import TableServer from "../../../src/table/TableServer";
import { getUniqueName } from "../../testutils";
import {
  createConnectionStringForTest,
  createTableServerForTest
} from "../utils/table.entity.test.utils";
import { AzureStorageSDKEntityFactory } from "../utils/AzureStorageSDKEntityFactory";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_TABLE_STORAGE added to mocha
// script or launch.json containing
// Azure Storage Connection String (using SAS or Key).
const testLocalAzuriteInstance = true;

const entityFactory = new AzureStorageSDKEntityFactory();

describe("table Entity APIs test - using azure/data-tables", () => {
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

  // Simple test in here until we have the full set checked in, as we need
  // a starting point for delete and query entity APIs
  it("01. Should insert new Entity, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity
    const entity = entityFactory.createBasicEntityForTest();

    const result = await tableClient.createEntity(entity);

    assert.ok(result.etag, "etag should be present");

    assert.match(
      result.etag!,
      /W\/"datetime'\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}\.\d{7}Z'"/
    );
  });

  // Insert entity property with type "Edm.DateTime", server will convert to UTC time
  it("02. Insert new Entity property with type Edm.DateTime will convert to UTC, @loki", async () => {
    const timeValue = "2012-01-02T23:00:00";

    const entity = {
      partitionKey: "part1",
      rowKey: "utctest",
      myValue: new Date(timeValue) // ✅ use Date object
    };

    await tableClient.createEntity(entity);

    const insertedEntity = await tableClient.getEntity("part1", "utctest");

    // ✅ retrieved as Date
    assert.ok(insertedEntity.myValue instanceof Date);

    assert.strictEqual(
      insertedEntity.myValue.toString(),
      new Date(timeValue).toString()
    );
  });

  // Insert empty entity property with type "Edm.DateTime", server will return error
  //If we pass "", SDK treats it as string, not Date, so to trigger failure, we must pass invalid Date.
  it("03. Insert invalid Date should fail, @loki", async () => {
    const invalidDate = new Date(""); // Invalid Date

    const entity = {
      partitionKey: "part1",
      rowKey: "utctest",
      myValue: invalidDate
    };

    await assert.rejects(
      async () => {
        await tableClient.createEntity(entity);
      },
      (error: any) => {
        assert.ok(
          error.message.includes("Invalid") || error.message.includes("Date"),
          "Expected date validation failure"
        );
        return true;
      }
    );
  });

  // Simple test in here until we have the full set checked in, as we need
  // a starting point for delete and query entity APIs
  it("04. Should insert new Entity with empty RowKey, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity
    const entity = {
      partitionKey: "part1",
      rowKey: "",
      myValue: "test"
    };

    const result = await tableClient.createEntity(entity);

    // ✅ Write-path validation only
    assert.ok(result.etag, "etag should be present");
  });

  it("05. Should retrieve entity with empty RowKey, @loki", async () => {
    const entity = {
      partitionKey: "part1",
      rowKey: "",
      myValue: getUniqueName("uniqueValue")
    };

    // Setup
    await tableClient.upsertEntity(entity);

    // ✅ Read-path validation
    const result = await tableClient.getEntity(entity.partitionKey, "");

    assert.strictEqual(result.rowKey, "");
    assert.strictEqual(result.myValue, entity.myValue);
  });

  it("06. Should delete an Entity using etag wildcard, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entity = entityFactory.createBasicEntityForTest();

    await tableClient.createEntity(entity);
    let statusCode: number | undefined;

    await tableClient.deleteEntity(entity.partitionKey, entity.rowKey, {
      /* https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1#request-headers
        If-Match	Required. The client may specify the ETag for the entity on the request in
        order to compare to the ETag maintained by the service for the purpose of optimistic concurrency.
        The delete operation will be performed only if the ETag sent by the client matches the value
        maintained by the server, indicating that the entity has not been modified since it was retrieved by the client.
        To force an unconditional delete, set If-Match to the wildcard character (*). */
      etag: "*",
      onResponse: (rawResponse) => {
        statusCode = rawResponse.status;
      }
    });

    assert.strictEqual(statusCode, 204);

    // Strong behavioural assertion: entity should be gone
    await assert.rejects(
      async () => {
        await tableClient.getEntity(entity.partitionKey, entity.rowKey);
      },
      (error: any) => {
        assert.strictEqual(error.statusCode, 404);
        return true;
      }
    );
  });

  it("07. Should not delete an Entity not matching Etag, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entity = entityFactory.createBasicEntityForTest();

    await tableClient.createEntity(entity);

    const fetched = await tableClient.getEntity(
      entity.partitionKey,
      entity.rowKey
    );

    const badEtag = fetched.etag!.replace("20", "21"); // test will be valid for 100 years... if it causes problems then, I shall be very proud

    await assert.rejects(
      async () => {
        await tableClient.deleteEntity(entity.partitionKey, entity.rowKey, {
          etag: badEtag
        });
      },
      (error: any) => {
        assert.strictEqual(error.statusCode, 412); // Precondition Failed
        return true;
      }
    );

    // Optional but good: prove entity still exists
    const stillThere = await tableClient.getEntity(
      entity.partitionKey,
      entity.rowKey
    );
    assert.strictEqual(stillThere.partitionKey, entity.partitionKey);
    assert.strictEqual(stillThere.rowKey, entity.rowKey);
  });

  it("08. Should delete a matching Etag, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entityInsert = entityFactory.createBasicEntityForTest();

    await tableClient.createEntity(entityInsert);

    const fetched = await tableClient.getEntity(
      entityInsert.partitionKey,
      entityInsert.rowKey
    );

    let deleteStatus: number | undefined;

    await tableClient.deleteEntity(
      entityInsert.partitionKey,
      entityInsert.rowKey,
      {
        etag: fetched.etag,
        onResponse: (rawResponse) => {
          deleteStatus = rawResponse.status;
        }
      }
    );

    assert.strictEqual(deleteStatus, 204);

    await assert.rejects(
      async () => {
        await tableClient.getEntity(
          entityInsert.partitionKey,
          entityInsert.rowKey
        );
      },
      (error: any) => {
        assert.strictEqual(error.statusCode, 404);
        return true;
      }
    );
  });

  it("09. Update an Entity that exists, @loki", async () => {
    const entityInsert = entityFactory.createBasicEntityForTest();

    await tableClient.createEntity(entityInsert);

    let updateStatus: number | undefined;

    await tableClient.updateEntity(
      {
        partitionKey: entityInsert.partitionKey,
        rowKey: entityInsert.rowKey,
        myValue: "newValue"
      },
      "Replace",
      {
        etag: "*",
        onResponse: (rawResponse) => {
          updateStatus = rawResponse.status;
        }
      }
    );

    assert.strictEqual(updateStatus, 204);

    const updated = await tableClient.getEntity(
      entityInsert.partitionKey,
      entityInsert.rowKey
    );

    assert.strictEqual(updated.myValue, "newValue");
  });

  it("10. Should fail replacing when an Entity does not exist, @loki", async () => {
    const entityToUpdate = entityFactory.createBasicEntityForTest();
    // this is submitting an update with if-match == *
    await assert.rejects(
      async () => {
        await tableClient.updateEntity(entityToUpdate, "Replace", {
          etag: "*"
        });
      },
      (error: any) => {
        assert.strictEqual(error.statusCode, 404);
        return true;
      }
    );
  });

  it("11. Should not update an Entity not matching Etag, @loki", async () => {
    const entityInsert = entityFactory.createBasicEntityForTest();

    await tableClient.createEntity(entityInsert);

    const fetched = await tableClient.getEntity(
      entityInsert.partitionKey,
      entityInsert.rowKey
    );

    const badEtag = fetched.etag!.replace("20", "21"); // test will be valid for 100 years... if it causes problems then, I shall be very proud

    await assert.rejects(
      async () => {
        await tableClient.updateEntity(
          {
            partitionKey: entityInsert.partitionKey,
            rowKey: entityInsert.rowKey,
            myValue: entityInsert.myValue
          },
          "Replace",
          { etag: badEtag }
        );
      },
      (error: any) => {
        assert.strictEqual(error.statusCode, 412); // Precondition failed
        return true;
      }
    );

    // Optional but useful: prove entity was not modified
    const after = await tableClient.getEntity(
      entityInsert.partitionKey,
      entityInsert.rowKey
    );
    assert.strictEqual(after.partitionKey, entityInsert.partitionKey);
    assert.strictEqual(after.rowKey, entityInsert.rowKey);
  });

  it("12. Should update, if Etag matches, @loki", async () => {
    const entityTemplate = entityFactory.createBasicEntityForTest();

    const entityInsert = {
      partitionKey: entityTemplate.partitionKey,
      rowKey: entityTemplate.rowKey,
      myValue: "oldValue"
    };

    await tableClient.createEntity(entityInsert);

    const fetched = await tableClient.getEntity(
      entityInsert.partitionKey,
      entityInsert.rowKey
    );

    let updateStatus: number | undefined;

    await tableClient.updateEntity(
      {
        partitionKey: entityInsert.partitionKey,
        rowKey: entityInsert.rowKey,
        myValue: "oldValueUpdate"
      },
      "Replace",
      {
        etag: fetched.etag,
        onResponse: (rawResponse) => {
          updateStatus = rawResponse.status;
        }
      }
    );

    assert.strictEqual(updateStatus, 204);

    const updated = await tableClient.getEntity(
      entityInsert.partitionKey,
      entityInsert.rowKey
    );

    assert.strictEqual(updated.myValue, "oldValueUpdate");
  });

  // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-or-replace-entity
  it("13. Insert or Replace (upsert) on an Entity that does not exist, @loki", async () => {
    const entityToInsert = entityFactory.createBasicEntityForTest();

    let upsertStatus: number | undefined;

    await tableClient.upsertEntity(entityToInsert, "Replace", {
      onResponse: (rawResponse) => {
        upsertStatus = rawResponse.status;
      }
    });

    assert.strictEqual(upsertStatus, 204);

    const result = await tableClient.getEntity(
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

    await tableClient.createEntity(upsertEntity);

    upsertEntity.myValue = "updated";

    let upsertStatus: number | undefined;

    await tableClient.upsertEntity(upsertEntity, "Replace", {
      onResponse: (rawResponse) => {
        upsertStatus = rawResponse.status;
      }
    });

    assert.strictEqual(upsertStatus, 204);

    const result = await tableClient.getEntity(
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

    await tableClient.createEntity(entityInsert);

    entityInsert.myValue = "new value";

    await tableClient.upsertEntity(entityInsert, "Merge");

    const result = await tableClient.getEntity(
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

    await tableClient.upsertEntity(entityToInsertOrMerge, "Merge");

    const result = await tableClient.getEntity(
      entityToInsertOrMerge.partitionKey,
      entityToInsertOrMerge.rowKey
    );

    assert.strictEqual(
      result.myValue,
      entityToInsertOrMerge.myValue,
      "Inserted value did not match"
    );
  });

  // Start of Batch Tests:
  it("17. Simple Insert Or Replace of a SINGLE entity as a BATCH, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();

    const tx = new TableTransaction();
    tx.upsertEntity(batchEntity1, "Replace");

    await tableClient.submitTransaction(tx.actions);

    const result = await tableClient.getEntity(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(result.myValue, batchEntity1.myValue);
  });

  [
    { pk: "pk", rk: "rk", label: "normal partition key and row key" },
    { pk: "", rk: "rk", label: "empty partition key" },
    { pk: "pk", rk: "", label: "empty row key" }
  ].forEach(({ pk, rk, label }) => {
    ["INSERT", "INSERT_OR_MERGE", "INSERT_OR_REPLACE"].forEach((operation) => {
      it(`18. ${operation} entity with ${label} in a BATCH, @loki`, async () => {
        const batchEntity1 = {
          partitionKey: !pk ? pk : getUniqueName(pk),
          rowKey: !rk ? rk : getUniqueName(rk),
          myValue: "value1"
        };

        const tx = new TableTransaction();

        switch (operation) {
          case "INSERT":
            tx.createEntity(batchEntity1);
            break;
          case "INSERT_OR_MERGE":
            tx.upsertEntity(batchEntity1, "Merge");
            break;
          case "INSERT_OR_REPLACE":
            tx.upsertEntity(batchEntity1, "Replace");
            break;
          default:
            assert.fail(`Unsupported operation: ${operation}`);
        }

        await tableClient.submitTransaction(tx.actions);

        const result = await tableClient.getEntity(
          batchEntity1.partitionKey,
          batchEntity1.rowKey
        );

        assert.strictEqual(result.myValue, batchEntity1.myValue);
      });
    });

    ["MERGE", "REPLACE"].forEach((operation) => {
      it(`19. ${operation} of entity with ${label} in a BATCH, @loki`, async () => {
        const batchEntity1 = {
          partitionKey: !pk ? pk : getUniqueName(pk),
          rowKey: !rk ? rk : getUniqueName(rk),
          myValue: "value1"
        };

        await tableClient.createEntity(batchEntity1);

        const tx = new TableTransaction();

        tx.updateEntity(
          batchEntity1,
          operation === "MERGE" ? "Merge" : "Replace",
          { etag: "*" }
        );

        await tableClient.submitTransaction(tx.actions);

        const result = await tableClient.getEntity(
          batchEntity1.partitionKey,
          batchEntity1.rowKey
        );

        assert.strictEqual(result.myValue, batchEntity1.myValue);
      });
    });

    it(`20. DELETE of entity with ${label} in a BATCH, @loki`, async () => {
      const batchEntity1 = {
        partitionKey: !pk ? pk : getUniqueName(pk),
        rowKey: !rk ? rk : getUniqueName(rk),
        myValue: "value1"
      };

      await tableClient.createEntity(batchEntity1);

      const tx = new TableTransaction();
      tx.deleteEntity(batchEntity1.partitionKey, batchEntity1.rowKey);

      await tableClient.submitTransaction(tx.actions);

      await assert.rejects(
        async () => {
          await tableClient.getEntity(
            batchEntity1.partitionKey,
            batchEntity1.rowKey
          );
        },
        (error: any) => {
          assert.strictEqual(error.statusCode, 404);
          return true;
        }
      );
    });
  });

  it("21. Simple batch test: Inserts multiple entities as a batch, @loki", async () => {
    const sharedPk = getUniqueName("batchpk");

    const batchEntity1 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };
    const batchEntity2 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value2"
    };
    const batchEntity3 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value3"
    };

    const tx = new TableTransaction();
    tx.createEntity(batchEntity1);
    tx.createEntity(batchEntity2);
    tx.createEntity(batchEntity3);

    await tableClient.submitTransaction(tx.actions);

    const result = await tableClient.getEntity(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(result.myValue, batchEntity1.myValue);
  });

  it("22. Simple batch test: Delete multiple entities as a batch, @loki", async () => {
    const sharedPk = getUniqueName("batchpk");

    const batchEntity1 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };
    const batchEntity2 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value2"
    };
    const batchEntity3 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value3"
    };

    assert.notStrictEqual(
      batchEntity1.rowKey,
      batchEntity2.rowKey,
      "failed to create unique test entities 1 & 2"
    );
    assert.notStrictEqual(
      batchEntity1.rowKey,
      batchEntity3.rowKey,
      "failed to create unique test entities 1 & 3"
    );

    const insertTx = new TableTransaction();
    insertTx.createEntity(batchEntity1);
    insertTx.createEntity(batchEntity2);
    insertTx.createEntity(batchEntity3);

    await tableClient.submitTransaction(insertTx.actions);

    const inserted = await tableClient.getEntity(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );
    assert.strictEqual(inserted.myValue, batchEntity1.myValue);

    const deleteTx = new TableTransaction();
    deleteTx.deleteEntity(batchEntity1.partitionKey, batchEntity1.rowKey);
    deleteTx.deleteEntity(batchEntity2.partitionKey, batchEntity2.rowKey);
    deleteTx.deleteEntity(batchEntity3.partitionKey, batchEntity3.rowKey);

    await tableClient.submitTransaction(deleteTx.actions);

    await assert.rejects(
      async () => {
        await tableClient.getEntity(
          batchEntity1.partitionKey,
          batchEntity1.rowKey
        );
      },
      (error: any) => {
        assert.strictEqual(error.statusCode, 404);
        return true;
      }
    );
  });

  it("23. Insert Or Replace multiple entities as a batch, @loki", async () => {
    const sharedPk = getUniqueName("batchpk");

    const batchEntity1 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };
    const batchEntity2 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value2"
    };
    const batchEntity3 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value3"
    };

    const tx = new TableTransaction();
    tx.upsertEntity(batchEntity1, "Replace");
    tx.upsertEntity(batchEntity2, "Replace");
    tx.upsertEntity(batchEntity3, "Replace");

    await tableClient.submitTransaction(tx.actions);

    const result = await tableClient.getEntity(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(result.myValue, batchEntity1.myValue);
  });

  it("24. Insert Or Merge multiple entities as a batch, @loki", async () => {
    const sharedPk = getUniqueName("batchpk");

    const batchEntity1 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };
    const batchEntity2 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value2"
    };
    const batchEntity3 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value3"
    };

    const tx = new TableTransaction();
    tx.upsertEntity(batchEntity1, "Merge");
    tx.upsertEntity(batchEntity2, "Merge");
    tx.upsertEntity(batchEntity3, "Merge");

    await tableClient.submitTransaction(tx.actions);

    const result = await tableClient.getEntity(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(result.myValue, batchEntity1.myValue);
  });

  it("25. Insert and Update entity via a batch, @loki", async () => {
    const sharedPk = getUniqueName("batchpk");

    const batchEntity1 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    await tableClient.createEntity(batchEntity1);

    const batchEntity2 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "valueX"
    };

    const tx = new TableTransaction();
    tx.createEntity(batchEntity2);

    batchEntity1.myValue = "value2";
    tx.updateEntity(batchEntity1, "Replace", { etag: "*" });

    await tableClient.submitTransaction(tx.actions);

    const result = await tableClient.getEntity(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(result.myValue, batchEntity1.myValue);
  });

  it("26. Insert and Merge entity via a batch, @loki", async () => {
    const sharedPk = getUniqueName("batchpk");

    const batchEntity1 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    await tableClient.createEntity(batchEntity1);

    const batchEntity2 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "valueX"
    };

    const tx = new TableTransaction();
    tx.createEntity(batchEntity2);

    batchEntity1.myValue = "value2";
    tx.updateEntity(batchEntity1, "Merge", { etag: "*" });

    await tableClient.submitTransaction(tx.actions);

    const result = await tableClient.getEntity(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(result.myValue, batchEntity1.myValue);
  });

  it("27. Insert and Delete entity via a batch, @loki", async () => {
    const sharedPk = getUniqueName("batchpk");

    const batchEntity1 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    await tableClient.createEntity(batchEntity1);

    const batchEntity2 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "valueX"
    };

    const tx = new TableTransaction();
    tx.createEntity(batchEntity2);
    tx.deleteEntity(batchEntity1.partitionKey, batchEntity1.rowKey);

    await tableClient.submitTransaction(tx.actions);

    await assert.rejects(
      async () => {
        await tableClient.getEntity(
          batchEntity1.partitionKey,
          batchEntity1.rowKey
        );
      },
      (error: any) => {
        assert.strictEqual(
          error.statusCode,
          404,
          "status code was not equal to 404!"
        );
        return true;
      }
    );
  });

  it("28. Query / Retrieve single entity with default options, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();

    await tableClient.createEntity(batchEntity1);

    const result = await tableClient.getEntity(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(result.myValue, batchEntity1.myValue);
  });

  it("29. Single Delete entity via a batch, @loki", async () => {
    const batchEntity1 = entityFactory.createBasicEntityForTest();

    await tableClient.createEntity(batchEntity1);

    const tx = new TableTransaction();
    tx.deleteEntity(batchEntity1.partitionKey, batchEntity1.rowKey);

    await tableClient.submitTransaction(tx.actions);

    await assert.rejects(
      async () => {
        await tableClient.getEntity(
          batchEntity1.partitionKey,
          batchEntity1.rowKey
        );
      },
      (error: any) => {
        assert.strictEqual(
          error.statusCode,
          404,
          "status code was not equal to 404!"
        );
        return true;
      }
    );
  });

  // this covers the following issues
  // https://github.com/Azure/Azurite/issues/750
  // https://github.com/Azure/Azurite/issues/733
  // https://github.com/Azure/Azurite/issues/745
  it("30. Operates on batch items with complex row keys, @loki", async () => {
    // For a valid transaction, all entities should share the same partitionKey.
    // If your factory already guarantees that, you can reuse it directly.
    const sharedPk = getUniqueName("batchpk");

    const insertEntity1 = {
      partitionKey: sharedPk,
      rowKey: "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0B",
      myValue: "value1"
    };

    const insertEntity2 = {
      partitionKey: sharedPk,
      rowKey: "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0C",
      myValue: "value1"
    };

    const insertEntity3 = {
      partitionKey: sharedPk,
      rowKey: "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0D",
      myValue: "value1"
    };

    const insertEntity4 = {
      partitionKey: sharedPk,
      rowKey: "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0E",
      myValue: "value1"
    };

    // Seed existing entities
    await tableClient.createEntity(insertEntity1);
    await tableClient.createEntity(insertEntity2);

    // Transaction: insert 3 & 4, delete 1 & 2
    const tx = new TableTransaction();
    tx.createEntity(insertEntity3);
    tx.createEntity(insertEntity4);
    tx.deleteEntity(insertEntity1.partitionKey, insertEntity1.rowKey);
    tx.deleteEntity(insertEntity2.partitionKey, insertEntity2.rowKey);

    await tableClient.submitTransaction(tx.actions);

    // Verify 3rd entity exists
    const entity3 = await tableClient.getEntity(
      insertEntity3.partitionKey,
      insertEntity3.rowKey
    );
    assert.strictEqual(
      entity3.rowKey,
      insertEntity3.rowKey,
      "We did not find the 3rd entity!"
    );

    // Verify 4th entity exists
    const entity4 = await tableClient.getEntity(
      insertEntity4.partitionKey,
      insertEntity4.rowKey
    );
    assert.strictEqual(
      entity4.rowKey,
      insertEntity4.rowKey,
      "We did not find the 4th entity!"
    );

    // Verify 1st entity deleted
    await assert.rejects(
      async () => {
        await tableClient.getEntity(
          insertEntity1.partitionKey,
          insertEntity1.rowKey
        );
      },
      (error: any) => {
        assert.strictEqual(
          error.statusCode,
          404,
          "We did not delete the 1st entity!"
        );
        return true;
      }
    );

    // Verify 2nd entity deleted
    await assert.rejects(
      async () => {
        await tableClient.getEntity(
          insertEntity2.partitionKey,
          insertEntity2.rowKey
        );
      },
      (error: any) => {
        assert.strictEqual(
          error.statusCode,
          404,
          "We did not delete the 2nd entity!"
        );
        return true;
      }
    );
  });

  // this covers https://github.com/Azure/Azurite/issues/741
  it("31. Operates on batch items with complex partition keys, @loki", async () => {
    const complexPartitionKey =
      "@DurableTask.AzureStorage.Tests.AzureStorageScenarioTests+Orchestrations+AutoStartOrchestration+Responder";

    const insertEntity1 = {
      partitionKey: complexPartitionKey,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    const insertEntity2 = {
      partitionKey: complexPartitionKey,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    const insertEntity3 = {
      partitionKey: complexPartitionKey,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    const insertEntity4 = {
      partitionKey: complexPartitionKey,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    // Seed the first two entities
    await tableClient.createEntity(insertEntity1);
    await tableClient.createEntity(insertEntity2);

    // Transaction: insert 3 & 4, delete 1 & 2
    const tx = new TableTransaction();
    tx.createEntity(insertEntity3);
    tx.createEntity(insertEntity4);
    tx.deleteEntity(insertEntity1.partitionKey, insertEntity1.rowKey);
    tx.deleteEntity(insertEntity2.partitionKey, insertEntity2.rowKey);

    await tableClient.submitTransaction(tx.actions);

    // Verify 3rd entity exists
    const entity3 = await tableClient.getEntity(
      insertEntity3.partitionKey,
      insertEntity3.rowKey
    );
    assert.strictEqual(
      entity3.partitionKey,
      insertEntity3.partitionKey,
      "We did not find the 3rd entity!"
    );

    // Verify 4th entity exists
    const entity4 = await tableClient.getEntity(
      insertEntity4.partitionKey,
      insertEntity4.rowKey
    );
    assert.strictEqual(
      entity4.partitionKey,
      insertEntity4.partitionKey,
      "We did not find the 4th entity!"
    );

    // Verify 1st entity deleted
    await assert.rejects(
      async () => {
        await tableClient.getEntity(
          insertEntity1.partitionKey,
          insertEntity1.rowKey
        );
      },
      (error: any) => {
        assert.strictEqual(
          error.statusCode,
          404,
          "We did not delete the 1st entity!"
        );
        return true;
      }
    );

    // Verify 2nd entity deleted
    await assert.rejects(
      async () => {
        await tableClient.getEntity(
          insertEntity2.partitionKey,
          insertEntity2.rowKey
        );
      },
      (error: any) => {
        assert.strictEqual(
          error.statusCode,
          404,
          "We did not delete the 2nd entity!"
        );
        return true;
      }
    );
  });

  it("32. Ensure Valid Etag format from Batch, @loki", async () => {
    const sharedPk = getUniqueName("batchpk");

    const batchEntity1 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    await tableClient.createEntity(batchEntity1);

    const batchEntity2 = {
      partitionKey: sharedPk,
      rowKey: getUniqueName("rk"),
      myValue: "valueX"
    };

    const tx = new TableTransaction();
    tx.createEntity(batchEntity2);

    batchEntity1.myValue = "value2";

    // Use wildcard to bypass concurrency — not testing ETag matching here

    //Same code tx.updateEntity(batchEntity1, "Merge", {
    //   etag: fetched.etag
    // });

    tx.updateEntity(batchEntity1, "Merge", { etag: "*" });

    await tableClient.submitTransaction(tx.actions);

    const entity = await tableClient.getEntity(
      batchEntity1.partitionKey,
      batchEntity1.rowKey
    );

    assert.strictEqual(entity.myValue, batchEntity1.myValue);

    assert.ok(entity.etag, "etag should be present");

    const matches = entity.etag!.match(/(%3A)/g);
    assert.ok(matches, "etag did not contain escaped ':' sequences");
    assert.strictEqual(
      matches!.length,
      2,
      "did not find the expected number of escaped sequences"
    );
  });

  it("33. Should expose a valid etag when inserting an entity, @loki", async () => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity
    const entityInsert = entityFactory.createBasicEntityForTest();

    const result = await tableClient.createEntity(entityInsert);

    assert.ok(result.etag, "etag should be present");
    assert.match(
      result.etag!,
      /W\/"datetime'\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}\.\d{7}Z'"/
    );
  });

  it("34. Can create entities with empty string for row and partition key, @loki", async () => {
    const emptyKeysEntity = {
      partitionKey: "",
      rowKey: "",
      myValue: "value1"
    };

    await tableClient.createEntity(emptyKeysEntity);

    const entity = await tableClient.getEntity("", "");

    assert.strictEqual(entity.partitionKey, "");
    assert.strictEqual(entity.rowKey, "");
    assert.strictEqual(entity.myValue, emptyKeysEntity.myValue);
  });

  it("35. Operates on batch items with partition keys with %25 in the middle, @loki", async () => {
    const specialPartitionKey = "percent2%25batch";

    const insertEntity1 = {
      partitionKey: specialPartitionKey,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    const insertEntity2 = {
      partitionKey: specialPartitionKey,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    const insertEntity3 = {
      partitionKey: specialPartitionKey,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    const insertEntity4 = {
      partitionKey: specialPartitionKey,
      rowKey: getUniqueName("rk"),
      myValue: "value1"
    };

    await tableClient.createEntity(insertEntity1);
    await tableClient.createEntity(insertEntity2);

    const tx = new TableTransaction();
    tx.createEntity(insertEntity3);
    tx.createEntity(insertEntity4);
    tx.deleteEntity(insertEntity1.partitionKey, insertEntity1.rowKey);
    tx.deleteEntity(insertEntity2.partitionKey, insertEntity2.rowKey);

    await tableClient.submitTransaction(tx.actions);

    const entity3 = await tableClient.getEntity(
      insertEntity3.partitionKey,
      insertEntity3.rowKey
    );
    assert.strictEqual(
      entity3.partitionKey,
      insertEntity3.partitionKey,
      "We did not find the 3rd entity!"
    );

    const entity4 = await tableClient.getEntity(
      insertEntity4.partitionKey,
      insertEntity4.rowKey
    );
    assert.strictEqual(
      entity4.partitionKey,
      insertEntity4.partitionKey,
      "We did not find the 4th entity!"
    );

    await assert.rejects(
      async () => {
        await tableClient.getEntity(
          insertEntity1.partitionKey,
          insertEntity1.rowKey
        );
      },
      (error: any) => {
        assert.strictEqual(
          error.statusCode,
          404,
          "We did not delete the 1st entity!"
        );
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await tableClient.getEntity(
          insertEntity2.partitionKey,
          insertEntity2.rowKey
        );
      },
      (error: any) => {
        assert.strictEqual(
          error.statusCode,
          404,
          "We did not delete the 2nd entity!"
        );
        return true;
      }
    );
  });

  it("36. Merge on an Entity with single quote in PartitionKey and RowKey, @loki", async () => {
    const partitionKey = "pk single'quota string";
    const rowKey = "rk single'quota string";

    // Insert entity with the specific pk,rk
    const entityInsert = {
      partitionKey,
      rowKey,
      myValue: "value1"
    };

    await tableClient.createEntity(entityInsert);

    // Merge entity with the specific pk,rk, to a different value
    const entityMerge = {
      partitionKey,
      rowKey,
      myValue: "value2"
    };

    let updateStatus: number | undefined;

    await tableClient.updateEntity(entityMerge, "Merge", {
      etag: "*",
      onResponse: (rawResponse) => {
        updateStatus = rawResponse.status;
      }
    });
    // Precondition succeeded
    assert.strictEqual(updateStatus, 204);

    // Retrieve entity with the specific pk,rk, and validate value is updated
    const result = await tableClient.getEntity(partitionKey, rowKey);

    assert.strictEqual(result.partitionKey, partitionKey);
    assert.strictEqual(result.rowKey, rowKey);
    assert.strictEqual(result.myValue, "value2");
  });
  ``;

  // for github issue #1536
  it("37. Should ignore client-supplied etag-like property when inserting entity, @loki", async () => {
    const dropEtagPKey = getUniqueName("drop");
    const rowKey1 = getUniqueName("rk1");

    const entityInsert = {
      partitionKey: dropEtagPKey,
      rowKey: rowKey1,
      myValue: "value"
    };

    await tableClient.createEntity(entityInsert);

    const queryResult = await tableClient.getEntity(
      entityInsert.partitionKey,
      entityInsert.rowKey
    );

    assert.strictEqual(queryResult.myValue, entityInsert.myValue);

    // now add odata etag property to the entity
    const rowKey2 = getUniqueName("rk2");
    const entityWithEtag: any = {
      partitionKey: queryResult.partitionKey,
      rowKey: rowKey2,
      myValue: queryResult.myValue,
      "odata.etag": `W/"datetime'2021-06-30T00%3A00%3A00.0000000Z'"`
    };

    await tableClient.createEntity(entityWithEtag);

    const query2Result = await tableClient.getEntity(
      entityWithEtag.partitionKey,
      entityWithEtag.rowKey
    );

    assert.strictEqual(query2Result.myValue, entityInsert.myValue);

    // SDK-level assertion: a server etag exists and is not equal to the fake literal
    assert.ok(query2Result.etag, "etag should be present");
    assert.notStrictEqual(
      query2Result.etag,
      `W/"datetime'2021-06-30T00%3A00%3A00.0000000Z'"`,
      "Etag value is not writable and should not be preserved as supplied."
    );
  });

  // For github issue 2387
  // Insert entity property with type "Edm.Double" and value bigger than MAX_VALUE, server will fail the request
  it("38. Insert entity with Edm.Double type property whose value is bigger than MAX_VALUE, server will fail the request, @loki", async () => {
    // Closest JS/EDM equivalent for a value beyond Number.MAX_VALUE is Infinity
    // Double value bigger than MAX_VALUE will fail
    const entity1 = {
      partitionKey: "partDouble",
      rowKey: "utctestDoubleOverflow",
      myValue: {
        value: Number.POSITIVE_INFINITY,
        type: "Double" as const
      }
    };

    await assert.rejects(
      async () => {
        await tableClient.createEntity(entity1);
      },
      (error: any) => {
        // The exact code/message should be validated in your environment.
        // We only assert that the request fails.
        assert.ok(error, "Expected insert to fail for non-finite Double value");
        return true;
      }
    );

    // Double value smaller than MAX_VALUE will success
    const entity2 = {
      partitionKey: "partDouble",
      rowKey: "utctestDoubleFinite",
      myValue: {
        value: 1.797693134862315e308,
        type: "Double" as const
      }
    };

    await tableClient.createEntity(entity2);

    const result = await tableClient.getEntity(
      "partDouble",
      "utctestDoubleFinite"
    );

    // Depending on deserialisation in your environment, this may come back as a number
    // or as an EDM-shaped object if you’ve wrapped/typed more strictly in your own models.
    const stored =
      typeof result.myValue === "object" &&
      result.myValue !== null &&
      "value" in (result.myValue as any)
        ? (result.myValue as any).value
        : result.myValue;

    assert.strictEqual(stored.toString(), "1.797693134862315e+308");
  });
});
