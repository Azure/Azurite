import * as assert from "assert";
import * as Azure from "azure-storage";

import { configLogger } from "../../../src/common/Logger";
import StorageError from "../../../src/table/errors/StorageError";
import TableConfiguration from "../../../src/table/TableConfiguration";
import TableServer from "../../../src/table/TableServer";
import {
  EMULATOR_ACCOUNT_KEY,
  EMULATOR_ACCOUNT_NAME,
  getUniqueName,
  overrideRequest,
  restoreBuildRequestOptions
} from "../../testutils";

// Set true to enable debug log
configLogger(false);

/**
 * Creates an entity for tests, with a randomized row key,
 * to avoid conflicts on inserts.
 *
 * @return {*}  {TestEntity}
 */
function createBasicEntityForTest(): TestEntity {
  return new TestEntity("part1", getUniqueName("row"), "value1");
}

class TestEntity {
  public PartitionKey: Azure.TableUtilities.entityGenerator.EntityProperty<
    string
  >;
  public RowKey: Azure.TableUtilities.entityGenerator.EntityProperty<string>;
  public myValue: Azure.TableUtilities.entityGenerator.EntityProperty<string>;
  constructor(part: string, row: string, value: string) {
    this.PartitionKey = eg.String(part);
    this.RowKey = eg.String(row);
    this.myValue = eg.String(value);
  }
}

const eg = Azure.TableUtilities.entityGenerator;

describe("table Entity APIs test", () => {
  // TODO: Create a server factory as tests utils
  const protocol = "http";
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
    debugLogPath
  );

  let server: TableServer;
  const accountName = EMULATOR_ACCOUNT_NAME;
  const sharedKey = EMULATOR_ACCOUNT_KEY;
  const connectionString =
    `DefaultEndpointsProtocol=${protocol};AccountName=${accountName};` +
    `AccountKey=${sharedKey};TableEndpoint=${protocol}://${host}:${port}/${accountName};`;

  const tableService = Azure.createTableService(connectionString);
  // ToDo: added due to problem with batch responses not finishing properly - Need to investigate batch response
  tableService.enableGlobalHttpAgent = true;

  let tableName: string = getUniqueName("table");

  const requestOverride = { headers: {} };

  before(async () => {
    overrideRequest(requestOverride, tableService);
    server = new TableServer(config);
    tableName = getUniqueName("table");
    await server.start();
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };

    tableService.createTable(tableName, (error, result, response) => {
      // created table for tests
    });
  });

  after(async () => {
    await server.close();
    restoreBuildRequestOptions(tableService);
  });

  // Simple test in here until we have the full set checked in, as we need
  // a starting point for delete and query entity APIs
  it("Should insert new Entity, @loki", (done) => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity
    const entity = {
      PartitionKey: "part1",
      RowKey: "row1",
      myValue: "value1"
    };
    tableService.insertEntity(tableName, entity, (error, result, response) => {
      assert.equal(response.statusCode, 201);
      assert.ok(
        response.headers?.etag.match(
          "W/\"datetime'\\d{4}-\\d{2}-\\d{2}T\\d{2}%3A\\d{2}%3A\\d{2}.\\d{7}Z'\""
        )
      );
      done();
    });
  });

  // Insert entity property with type "Edm.DateTime", server will convert to UTC time
  it("Insert new Entity property with type Edm.DateTime will convert to UTC, @loki", (done) => {
    const timeValue = "2012-01-02T23:00:00";
    const entity = {
      PartitionKey: "part1",
      RowKey: "utctest",
      myValue: timeValue,
      "myValue@odata.type": "Edm.DateTime"
    };

    tableService.insertEntity(
      tableName,
      entity,
      (insertError, insertResult, insertResponse) => {
        if (!insertError) {
          tableService.retrieveEntity<TestEntity>(
            tableName,
            "part1",
            "utctest",
            (error, result) => {
              const entity: TestEntity = result;
              assert.strictEqual(
                entity.myValue._.toString(),
                new Date(timeValue + "Z").toString()
              );
              done();
            }
          );
        } else {
          assert.ifError(insertError);
          done();
        }
      }
    );
  });

  // Simple test in here until we have the full set checked in, as we need
  // a starting point for delete and query entity APIs
  it("Should insert new Entity with empty RowKey, @loki", (done) => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity
    const entity = {
      PartitionKey: "part1",
      RowKey: "",
      myValue: "value1"
    };
    tableService.insertEntity(tableName, entity, (error, result, response) => {
      assert.equal(response.statusCode, 201);
      assert.ok(
        response.headers?.etag.match(
          "W/\"datetime'\\d{4}-\\d{2}-\\d{2}T\\d{2}%3A\\d{2}%3A\\d{2}.\\d{7}Z'\""
        )
      );
      done();
    });
  });

  it("Should retrieve entity with empty RowKey, @loki", (done) => {
    const entityInsert = {
      PartitionKey: "part2",
      RowKey: "",
      myValue: "value1"
    };
    tableService.insertEntity(
      tableName,
      entityInsert,
      (insertError, insertResult, insertResponse) => {
        if (!insertError) {
          var query = new Azure.TableQuery()
            .where("PartitionKey == ?", "part2")
            .and("myValue == ?", "value1");

          tableService.queryEntities(
            tableName,
            query,
            <any>null,
            <any>null,
            (queryError, queryResult, queryResponse) => {
              if (!queryError) {
                if (queryResult.entries && queryResult.entries.length > 0) {
                  assert.equal(queryResponse.statusCode, 200);
                  done();
                } else {
                  assert.fail("Test failed to retrieve the entity.");
                }
              } else {
                assert.ifError(queryError);
                done();
              }
            }
          );
        } else {
          assert.ifError(insertError);
          done();
        }
      }
    );
  });

  it("Should delete an Entity using etag wildcard, @loki", (done) => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entity = {
      PartitionKey: "part1",
      RowKey: "row1",
      myValue: "somevalue",
      ".metadata": {
        etag: "*" // forcing unconditional etag match to delete
      }
    };

    /* https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1#request-headers
    If-Match	Required. The client may specify the ETag for the entity on the request in
    order to compare to the ETag maintained by the service for the purpose of optimistic concurrency.
    The delete operation will be performed only if the ETag sent by the client matches the value
    maintained by the server, indicating that the entity has not been modified since it was retrieved by the client.
    To force an unconditional delete, set If-Match to the wildcard character (*). */

    tableService.deleteEntity(tableName, entity, (error, response) => {
      assert.equal(response.statusCode, 204);
      done();
    });
  });

  it("Should not delete an Entity not matching Etag, @loki", (done) => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entityInsert = {
      PartitionKey: "part1",
      RowKey: "row2",
      myValue: "shouldNotMatchetag"
    };
    const entityDelete = {
      PartitionKey: "part1",
      RowKey: "row2",
      myValue: "shouldNotMatchetag",
      ".metadata": {
        etag: "0x2252C97588D4000"
      }
    };
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    tableService.insertEntity(
      tableName,
      entityInsert,
      (insertError, insertResult, insertResponse) => {
        if (!insertError) {
          requestOverride.headers = {};
          tableService.deleteEntity(
            tableName,
            entityDelete,
            (deleteError, deleteResponse) => {
              assert.equal(deleteResponse.statusCode, 412); // Precondition failed
              done();
            }
          );
        } else {
          assert.ifError(insertError);
          done();
        }
      }
    );
  });

  it("Should delete a matching Etag, @loki", (done) => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entityInsert = {
      PartitionKey: "part1",
      RowKey: "row3",
      myValue: "shouldMatchEtag"
    };
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    tableService.insertEntity(
      tableName,
      entityInsert,
      (error, result, insertresponse) => {
        if (!error) {
          requestOverride.headers = {};
          tableService.deleteEntity(
            tableName,
            result, // SDK defined entity type...
            (deleteError, deleteResponse) => {
              if (!deleteError) {
                assert.equal(deleteResponse.statusCode, 204); // Precondition succeeded
                done();
              } else {
                assert.ifError(deleteError);
                done();
              }
            }
          );
        } else {
          assert.ifError(error);
          done();
        }
      }
    );
  });

  it("Update an Entity that exists, @loki", (done) => {
    const entityInsert = {
      PartitionKey: "part1",
      RowKey: "row3",
      myValue: "oldValue"
    };
    tableService.insertEntity(
      tableName,
      entityInsert,
      (error, result, insertresponse) => {
        if (!error) {
          requestOverride.headers = {};
          tableService.replaceEntity(
            tableName,
            { PartitionKey: "part1", RowKey: "row3", myValue: "newValue" },
            (updateError, updateResult, updateResponse) => {
              if (!updateError) {
                assert.equal(updateResponse.statusCode, 204); // Precondition succeeded
                done();
              } else {
                assert.ifError(updateError);
                done();
              }
            }
          );
        } else {
          assert.ifError(error);
          done();
        }
      }
    );
  });

  it("Update an Entity that does not exist, @loki", (done) => {
    tableService.replaceEntity(
      tableName,
      { PartitionKey: "part1", RowKey: "row4", myValue: "newValue" },
      (updateError, updateResult, updateResponse) => {
        const castUpdateStatusCode = (updateError as StorageError).statusCode;
        if (updateError) {
          assert.equal(castUpdateStatusCode, 404);
          done();
        } else {
          assert.fail("Test failed to throw the right Error" + updateError);
        }
      }
    );
  });

  it("Should not update an Entity not matching Etag, @loki", (done) => {
    const entityInsert = {
      PartitionKey: "part1",
      RowKey: "row4",
      myValue: "oldValue"
    };
    const entityUpdate = {
      PartitionKey: "part1",
      RowKey: "row4",
      myValue: "oldValueUpdate",
      ".metadata": {
        etag: "0x2252C97588D4000"
      }
    };
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    tableService.insertEntity(
      tableName,
      entityInsert,
      (insertError, insertResult, insertResponse) => {
        if (!insertError) {
          requestOverride.headers = {};
          tableService.replaceEntity(
            tableName,
            entityUpdate,
            (updateError, updateResponse) => {
              const castUpdateStatusCode = (updateError as StorageError)
                .statusCode;
              assert.equal(castUpdateStatusCode, 412); // Precondition failed
              done();
            }
          );
        } else {
          assert.ifError(insertError);
          done();
        }
      }
    );
  });

  it("Should update, if Etag matches, @loki", (done) => {
    const entityInsert = {
      PartitionKey: "part1",
      RowKey: "row5",
      myValue: "oldValue"
    };
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    tableService.insertEntity(
      tableName,
      entityInsert,
      (error, result, insertresponse) => {
        const etagOld = result[".metadata"].etag;
        const entityUpdate = {
          PartitionKey: "part1",
          RowKey: "row5",
          myValue: "oldValueUpdate",
          ".metadata": {
            etag: etagOld
          }
        };
        if (!error) {
          requestOverride.headers = {};
          tableService.replaceEntity(
            tableName,
            entityUpdate,
            (updateError, updateResult, updateResponse) => {
              if (!updateError) {
                assert.equal(updateResponse.statusCode, 204); // Precondition succeeded
                done();
              } else {
                assert.ifError(updateError);
                done();
              }
            }
          );
        } else {
          assert.ifError(error);
          done();
        }
      }
    );
  });

  it("Insert or Replace (upsert) on an Entity that does not exist, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    tableService.insertOrReplaceEntity(
      tableName,
      {
        PartitionKey: "part1",
        RowKey: "row6",
        myValue: "firstValue"
      },
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 204); // No content
          // TODO When QueryEntity is done - validate Entity Properties
          done();
        }
      }
    );
  });

  it("Insert or Replace (upsert) on an Entity that exists, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const upsertEntity = createBasicEntityForTest();
    tableService.insertEntity(tableName, upsertEntity, () => {
      upsertEntity.myValue._ = "updated";
      tableService.insertOrReplaceEntity(
        tableName,
        upsertEntity,
        (updateError, updateResult, updateResponse) => {
          if (updateError) {
            assert.ifError(updateError);
            done();
          } else {
            assert.equal(updateResponse.statusCode, 204); // No content
            // TODO When QueryEntity is done - validate Entity Properties
            done();
          }
        }
      );
    });
  });

  it("Insert or Merge on an Entity that exists, @loki", (done) => {
    const entityInsert = createBasicEntityForTest();
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    tableService.insertEntity(
      tableName,
      entityInsert,
      (error, result, insertresponse) => {
        entityInsert.myValue._ = "new value";
        if (!error) {
          requestOverride.headers = {};
          tableService.insertOrMergeEntity(
            tableName,
            entityInsert,
            (updateError, updateResult, updateResponse) => {
              if (!updateError) {
                assert.equal(updateResponse.statusCode, 204); // Precondition succeeded
                // TODO When QueryEntity is done - validate Entity Properties
                done();
              } else {
                assert.ifError(updateError);
                done();
              }
            }
          );
        } else {
          assert.ifError(error);
          done();
        }
      }
    );
  });

  it("Insert or Merge on an Entity that does not exist, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    tableService.insertOrMergeEntity(
      tableName,
      {
        PartitionKey: "part1",
        RowKey: "row8",
        myValue: "firstValue"
      },
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 204); // No content
          // TODO When QueryEntity is done - validate Entity Properties
          done();
        }
      }
    );
  });

  // Start of Batch Tests:
  it("Simple Insert Or Replace of a SINGLE entity as a BATCH, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };

    const batchEntity1 = createBasicEntityForTest();

    const entityBatch: Azure.TableBatch = new Azure.TableBatch();
    entityBatch.addOperation("INSERT_OR_REPLACE", batchEntity1); // resulting in PUT

    tableService.executeBatch(
      tableName,
      entityBatch,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 202);
          tableService.retrieveEntity<TestEntity>(
            tableName,
            batchEntity1.PartitionKey._,
            batchEntity1.RowKey._,
            (error, result) => {
              if (error) {
                assert.ifError(error);
              } else if (result) {
                const entity: TestEntity = result;
                assert.equal(entity.myValue._, batchEntity1.myValue._);
              }
              done();
            }
          );
        }
      }
    );
  });

  it("Simple batch test: Inserts multiple entities as a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const batchEntity1 = createBasicEntityForTest();
    const batchEntity2 = createBasicEntityForTest();
    const batchEntity3 = createBasicEntityForTest();

    const entityBatch: Azure.TableBatch = new Azure.TableBatch();
    entityBatch.addOperation("INSERT", batchEntity1, { echoContent: true });
    entityBatch.addOperation("INSERT", batchEntity2, { echoContent: true });
    entityBatch.addOperation("INSERT", batchEntity3, { echoContent: true });

    tableService.executeBatch(
      tableName,
      entityBatch,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 202); // No content
          // Now that QueryEntity is done - validate Entity Properties as follows:
          tableService.retrieveEntity<TestEntity>(
            tableName,
            batchEntity1.PartitionKey._,
            batchEntity1.RowKey._,
            (error, result) => {
              const entity: TestEntity = result;
              assert.equal(entity.myValue._, batchEntity1.myValue._);
              done();
            }
          );
        }
      }
    );
  });

  it("Simple batch test: Delete multiple entities as a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    // First insert multiple entities to delete
    const batchEntity1 = createBasicEntityForTest();
    const batchEntity2 = createBasicEntityForTest();
    const batchEntity3 = createBasicEntityForTest();

    assert.notDeepEqual(
      batchEntity1.RowKey,
      batchEntity2.RowKey,
      "failed to create unique test entities 1 & 2"
    );
    assert.notDeepEqual(
      batchEntity1.RowKey,
      batchEntity3.RowKey,
      "failed to create unique test entities 2 & 3"
    );

    const insertEntityBatch: Azure.TableBatch = new Azure.TableBatch();
    insertEntityBatch.addOperation("INSERT", batchEntity1, {
      echoContent: true
    });
    insertEntityBatch.addOperation("INSERT", batchEntity2, {
      echoContent: true
    });
    insertEntityBatch.addOperation("INSERT", batchEntity3, {
      echoContent: true
    });

    const deleteEntityBatch: Azure.TableBatch = new Azure.TableBatch();
    deleteEntityBatch.deleteEntity(batchEntity1);
    deleteEntityBatch.deleteEntity(batchEntity2);
    deleteEntityBatch.deleteEntity(batchEntity3);

    tableService.executeBatch(
      tableName,
      insertEntityBatch,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 202); // No content
          // Now that QueryEntity is done - validate Entity Properties as follows:
          tableService.retrieveEntity<TestEntity>(
            tableName,
            batchEntity1.PartitionKey._,
            batchEntity1.RowKey._,
            (error, result) => {
              if (error) {
                assert.notEqual(error, null);
                done();
              }
              const entity: TestEntity = result;
              assert.equal(entity.myValue._, batchEntity1.myValue._);

              // now that we have confirmed that our test entities are created, we can try to delete them
              tableService.executeBatch(
                tableName,
                deleteEntityBatch,
                (
                  deleteUpdateError,
                  deleteUpdateResult,
                  deleteUpdateResponse
                ) => {
                  if (deleteUpdateError) {
                    assert.ifError(deleteUpdateError);
                    done();
                  } else {
                    assert.equal(deleteUpdateResponse.statusCode, 202); // No content
                    // Now that QueryEntity is done - validate Entity Properties as follows:
                    tableService.retrieveEntity<TestEntity>(
                      tableName,
                      batchEntity1.PartitionKey._,
                      batchEntity1.RowKey._,
                      (finalRetrieveError, finalRetrieveResult) => {
                        const retrieveError: StorageError = finalRetrieveError as StorageError;
                        assert.equal(
                          retrieveError.statusCode,
                          404,
                          "status code was not equal to 404!"
                        );
                        done();
                      }
                    );
                  }
                }
              );
            }
          );
        }
      }
    );
  });

  it("Insert Or Replace multiple entities as a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };

    const batchEntity1 = createBasicEntityForTest();
    const batchEntity2 = createBasicEntityForTest();
    const batchEntity3 = createBasicEntityForTest();

    const entityBatch: Azure.TableBatch = new Azure.TableBatch();
    entityBatch.addOperation("INSERT_OR_REPLACE", batchEntity1);
    entityBatch.addOperation("INSERT_OR_REPLACE", batchEntity2);
    entityBatch.addOperation("INSERT_OR_REPLACE", batchEntity3);

    tableService.executeBatch(
      tableName,
      entityBatch,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 202);
          tableService.retrieveEntity<TestEntity>(
            tableName,
            batchEntity1.PartitionKey._,
            batchEntity1.RowKey._,
            (error, result) => {
              if (error) {
                assert.ifError(error);
              } else if (result) {
                const entity: TestEntity = result;
                assert.equal(entity.myValue._, batchEntity1.myValue._);
              }
              done();
            }
          );
        }
      }
    );
  });

  it("Insert Or Merge multiple entities as a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const batchEntity1 = createBasicEntityForTest();
    const batchEntity2 = createBasicEntityForTest();
    const batchEntity3 = createBasicEntityForTest();

    const entityBatch: Azure.TableBatch = new Azure.TableBatch();
    entityBatch.addOperation("INSERT_OR_MERGE", batchEntity1);
    entityBatch.addOperation("INSERT_OR_MERGE", batchEntity2);
    entityBatch.addOperation("INSERT_OR_MERGE", batchEntity3);

    tableService.executeBatch(
      tableName,
      entityBatch,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 202);
          tableService.retrieveEntity<TestEntity>(
            tableName,
            batchEntity1.PartitionKey._,
            batchEntity1.RowKey._,
            (error, result) => {
              if (error) {
                assert.ifError(error);
              } else if (result) {
                const entity: TestEntity = result;
                assert.equal(entity.myValue._, batchEntity1.myValue._);
              }
              done();
            }
          );
        }
      }
    );
  });

  it("Insert and Update entity via a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const batchEntity1 = createBasicEntityForTest();

    const entityBatch: Azure.TableBatch = new Azure.TableBatch();
    entityBatch.addOperation("INSERT", batchEntity1, { echoContent: true });
    batchEntity1.myValue._ = "value2";
    entityBatch.replaceEntity(batchEntity1);

    tableService.executeBatch(
      tableName,
      entityBatch,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 202);
          tableService.retrieveEntity<TestEntity>(
            tableName,
            batchEntity1.PartitionKey._,
            batchEntity1.RowKey._,
            (error, result) => {
              if (error) {
                assert.ifError(error);
                done();
              } else if (result) {
                const entity: TestEntity = result;
                assert.equal(entity.myValue._, batchEntity1.myValue._);
              }
              done();
            }
          );
        }
      }
    );
  });

  it("Insert and Merge entity via a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const batchEntity1 = createBasicEntityForTest();

    const entityBatch: Azure.TableBatch = new Azure.TableBatch();
    entityBatch.addOperation("INSERT", batchEntity1, { echoContent: true });
    batchEntity1.myValue._ = "value2";
    entityBatch.mergeEntity(batchEntity1);

    tableService.executeBatch(
      tableName,
      entityBatch,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 202);
          tableService.retrieveEntity<TestEntity>(
            tableName,
            batchEntity1.PartitionKey._,
            batchEntity1.RowKey._,
            (error, result) => {
              if (error) {
                assert.ifError(error);
              } else if (result) {
                const entity: TestEntity = result;
                assert.equal(entity.myValue._, batchEntity1.myValue._);
              }
              done();
            }
          );
        }
      }
    );
  });

  it("Insert and Delete entity via a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const batchEntity1 = createBasicEntityForTest();

    const entityBatch: Azure.TableBatch = new Azure.TableBatch();
    entityBatch.addOperation("INSERT", batchEntity1, { echoContent: true });
    entityBatch.deleteEntity(batchEntity1);

    tableService.executeBatch(
      tableName,
      entityBatch,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.equal(updateResponse.statusCode, 202);
          tableService.retrieveEntity<TestEntity>(
            tableName,
            batchEntity1.PartitionKey._,
            batchEntity1.RowKey._,
            (error, result) => {
              const retrieveError: StorageError = error as StorageError;
              assert.equal(
                retrieveError.statusCode,
                404,
                "status code was not equal to 404!"
              );
              done();
            }
          );
        }
      }
    );
  });

  it("Query / Retrieve single entity via a batch, requestion Options undefined / default @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const batchEntity1 = createBasicEntityForTest();

    tableService.insertEntity(tableName, batchEntity1, (error, result) => {
      const entityBatch: Azure.TableBatch = new Azure.TableBatch();
      entityBatch.retrieveEntity(
        batchEntity1.PartitionKey._,
        batchEntity1.RowKey._
      );

      tableService.executeBatch(
        tableName,
        entityBatch,
        (updateError, updateResult, updateResponse) => {
          if (updateError) {
            assert.ifError(updateError);
            done();
          } else {
            assert.equal(updateResponse.statusCode, 202);
            const batchRetrieveEntityResult = updateResponse.body
              ? updateResponse.body
              : "";
            assert.notEqual(batchRetrieveEntityResult.indexOf("value1"), -1);
            done();
          }
        }
      );
    });
  });

  it("Single Delete entity via a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const batchEntity1 = createBasicEntityForTest();

    tableService.insertEntity<TestEntity>(tableName, batchEntity1, () => {
      const entityBatch: Azure.TableBatch = new Azure.TableBatch();
      entityBatch.deleteEntity(batchEntity1);

      tableService.executeBatch(
        tableName,
        entityBatch,
        (updateError, updateResult, updateResponse) => {
          if (updateError) {
            assert.ifError(updateError);
            done();
          } else {
            assert.equal(updateResponse.statusCode, 202);
            tableService.retrieveEntity<TestEntity>(
              tableName,
              batchEntity1.PartitionKey._,
              batchEntity1.RowKey._,
              (error: any, result) => {
                assert.equal(
                  error.statusCode,
                  404,
                  "status code was not equal to 404!"
                );
                done();
              }
            );
          }
        }
      );
    });
  });

  it.only("Operates on batch items with complex row keys, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const insertEntity1 = createBasicEntityForTest();
    insertEntity1.RowKey._ = "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0B";
    const insertEntity2 = createBasicEntityForTest();
    insertEntity2.RowKey._ = "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0C";
    const insertEntity3 = createBasicEntityForTest();
    insertEntity3.RowKey._ = "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0D";
    const insertEntity4 = createBasicEntityForTest();
    insertEntity4.RowKey._ = "8b0a63c8-9542-49d8-9dd2-d7af9fa8790f_0E";

    tableService.insertEntity<TestEntity>(tableName, insertEntity1, () => {
      tableService.insertEntity<TestEntity>(tableName, insertEntity2, () => {
        const entityBatch: Azure.TableBatch = new Azure.TableBatch();
        entityBatch.insertEntity(insertEntity3, {});
        entityBatch.insertEntity(insertEntity4, {});
        entityBatch.deleteEntity(insertEntity1);
        entityBatch.deleteEntity(insertEntity2);
        tableService.executeBatch(
          tableName,
          entityBatch,
          (updateError, updateResult, updateResponse) => {
            if (updateError) {
              assert.ifError(updateError);
              done();
            } else {
              assert.equal(updateResponse.statusCode, 202);
              tableService.retrieveEntity<TestEntity>(
                tableName,
                insertEntity3.PartitionKey._,
                insertEntity3.RowKey._,
                (error: any, result, response) => {
                  assert.strictEqual(
                    response.statusCode,
                    200,
                    "We did not find the 3rd entity!"
                  );
                  tableService.retrieveEntity<TestEntity>(
                    tableName,
                    insertEntity4.PartitionKey._,
                    insertEntity4.RowKey._,
                    (error2: any, result2, response2) => {
                      assert.strictEqual(
                        response2.statusCode,
                        200,
                        "We did not find the 4th entity!"
                      );
                      tableService.retrieveEntity<TestEntity>(
                        tableName,
                        insertEntity1.PartitionKey._,
                        insertEntity1.RowKey._,
                        (error3: any, result3, response3) => {
                          assert.strictEqual(
                            response3.statusCode,
                            404,
                            "We did not delete the 1st entity!"
                          );
                          tableService.retrieveEntity<TestEntity>(
                            tableName,
                            insertEntity2.PartitionKey._,
                            insertEntity2.RowKey._,
                            (error4: any, result4, response4) => {
                              assert.strictEqual(
                                response4.statusCode,
                                404,
                                "We did not delete the 2nd entity!"
                              );
                              done();
                            }
                          );
                        }
                      );
                    }
                  );
                }
              );
            }
          }
        );
      });
    });
  });
});
