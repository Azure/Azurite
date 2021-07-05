import * as assert from "assert";
import * as Azure from "azure-storage";

import { configLogger } from "../../../src/common/Logger";
import StorageError from "../../../src/table/errors/StorageError";

import TableServer from "../../../src/table/TableServer";
import {
  getUniqueName,
  overrideRequest,
  restoreBuildRequestOptions
} from "../../testutils";
import {
  createBasicEntityForTest,
  createConnectionStringForTest,
  createTableServerForTest
} from "./table.entity.test.utils";
import { TestEntity } from "./TestEntity";

// Set true to enable debug log
configLogger(false);
// For convenience, we have a switch to control the use
// of a local Azurite instance, otherwise we need an
// ENV VAR called AZURE_STORAGE
// containing Azure Storage Connection String.
const testLocalAzuriteInstance = false;

describe("table Entity APIs test", () => {
  let server: TableServer;
  const tableService = Azure.createTableService(
    createConnectionStringForTest(testLocalAzuriteInstance)
  );
  // ToDo: added due to problem with batch responses not finishing properly - Need to investigate batch response
  tableService.enableGlobalHttpAgent = true;

  let tableName: string = getUniqueName("table");

  const requestOverride = { headers: {} };

  before(async () => {
    overrideRequest(requestOverride, tableService);
    server = createTableServerForTest();
    tableName = getUniqueName("table");
    await server.start();
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };

    const created = new Promise((resolve, reject) => {
      tableService.createTable(tableName, (error, result, response) => {
        if (error) {
          reject();
        } else {
          resolve(response);
        }
      });
    });

    // we need to await here as we now also test against the service
    // which is not as fast as our in memory DBs
    await created.then().catch((createError) => {
      throw new Error("failed to create table");
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
    const entity = createBasicEntityForTest();
    tableService.insertEntity<TestEntity>(
      tableName,
      entity,
      (error, result, response) => {
        assert.strictEqual(response.statusCode, 201);
        assert.ok(
          response.headers?.etag.match(
            "W/\"datetime'\\d{4}-\\d{2}-\\d{2}T\\d{2}%3A\\d{2}%3A\\d{2}.\\d{7}Z'\""
          )
        );
        done();
      }
    );
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
              const insertedEntity: TestEntity = result;
              assert.strictEqual(
                insertedEntity.myValue._.toString(),
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
    const entity = createBasicEntityForTest();
    entity.RowKey._ = "";
    tableService.insertEntity<TestEntity>(
      tableName,
      entity,
      (error, result, response) => {
        assert.strictEqual(response.statusCode, 201);
        assert.ok(
          response.headers?.etag.match(
            "W/\"datetime'\\d{4}-\\d{2}-\\d{2}T\\d{2}%3A\\d{2}%3A\\d{2}.\\d{7}Z'\""
          )
        );
        done();
      }
    );
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
          const query = new Azure.TableQuery()
            .where("PartitionKey == ?", "part2")
            .and("myValue == ?", "value1");

          tableService.queryEntities(
            tableName,
            query,
            null as any,
            null as any,
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

    const entity = createBasicEntityForTest();
    tableService.insertEntity<TestEntity>(
      tableName,
      entity,
      (error, result, response) => {
        assert.strictEqual(response.statusCode, 201);
        /* https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1#request-headers
        If-Match	Required. The client may specify the ETag for the entity on the request in
        order to compare to the ETag maintained by the service for the purpose of optimistic concurrency.
        The delete operation will be performed only if the ETag sent by the client matches the value
        maintained by the server, indicating that the entity has not been modified since it was retrieved by the client.
        To force an unconditional delete, set If-Match to the wildcard character (*). */
        result[".metadata"].etag = "*";
        tableService.deleteEntity(
          tableName,
          result,
          (deleteError, deleteResponse) => {
            assert.ifError(deleteError);
            assert.strictEqual(deleteResponse.statusCode, 204);
            done();
          }
        );
      }
    );
  });

  it("Should not delete an Entity not matching Etag, @loki", (done) => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/delete-entity1
    const entityInsert = createBasicEntityForTest();
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
          insertResult[".metadata"].etag = insertResult[
            ".metadata"
          ].etag.replace("20", "21"); // test will be valid for 100 years... if it causes problems then, I shall be very proud
          tableService.deleteEntity(
            tableName,
            insertResult,
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
    const entityInsert = createBasicEntityForTest();
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
    const entityInsert = createBasicEntityForTest();
    tableService.insertEntity(
      tableName,
      entityInsert,
      (error, result, insertresponse) => {
        if (!error) {
          requestOverride.headers = {};
          tableService.replaceEntity(
            tableName,
            {
              PartitionKey: entityInsert.PartitionKey,
              RowKey: entityInsert.RowKey,
              myValue: "newValue"
            },
            (updateError, updateResult, updateResponse) => {
              if (!updateError) {
                assert.strictEqual(updateResponse.statusCode, 204); // Precondition succeeded
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

  it("Fails to update an Entity that does not exist, @loki", (done) => {
    const entityToUpdate = createBasicEntityForTest();
    tableService.replaceEntity(
      tableName,
      entityToUpdate,
      (updateError, updateResult, updateResponse) => {
        const castUpdateStatusCode = (updateError as StorageError).statusCode;
        if (updateError) {
          assert.strictEqual(castUpdateStatusCode, 404);
          done();
        } else {
          assert.fail("Test failed to throw the right Error" + updateError);
        }
      }
    );
  });

  it("Should not update an Entity not matching Etag, @loki", (done) => {
    const entityInsert = createBasicEntityForTest();
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
          const entityUpdate = insertResult;
          entityUpdate[".metadata"].etag = insertResult[
            ".metadata"
          ].etag.replace("20", "21"); // test will be valid for 100 years... if it causes problems then, I shall be very proud
          tableService.replaceEntity(
            tableName,
            entityUpdate,
            (updateError, updateResponse) => {
              const castUpdateStatusCode = (updateError as StorageError)
                .statusCode;
              assert.strictEqual(castUpdateStatusCode, 412); // Precondition failed
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
    const entityTemplate = createBasicEntityForTest();
    const entityInsert = {
      PartitionKey: entityTemplate.PartitionKey,
      RowKey: entityTemplate.RowKey,
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
          PartitionKey: entityTemplate.PartitionKey,
          RowKey: entityTemplate.RowKey,
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
                assert.strictEqual(updateResponse.statusCode, 204); // Precondition succeeded
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
    const entityToInsert = createBasicEntityForTest();
    tableService.insertOrReplaceEntity(
      tableName,
      entityToInsert,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          // x-ms-version:'2018-03-28'
          assert.strictEqual(updateResponse.statusCode, 200); // with these settings, the service responds with 200
          tableService.retrieveEntity<TestEntity>(
            tableName,
            entityToInsert.PartitionKey._,
            entityToInsert.RowKey._,
            (error, result) => {
              assert.strictEqual(
                result.myValue._,
                entityToInsert.myValue._,
                "Value was incorrect on retrieved entity"
              );
              done();
            }
          );
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
            assert.strictEqual(updateResponse.statusCode, 200); // get 200 back from service!
            tableService.retrieveEntity<TestEntity>(
              tableName,
              upsertEntity.PartitionKey._,
              upsertEntity.RowKey._,
              (error, result) => {
                assert.strictEqual(
                  result.myValue._,
                  upsertEntity.myValue._,
                  "Value was incorrect on retrieved entity"
                );
                done();
              }
            );
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
      (insertError, insertResult, insertresponse) => {
        entityInsert.myValue._ = "new value";
        if (!insertError) {
          requestOverride.headers = {};
          tableService.insertOrMergeEntity(
            tableName,
            entityInsert,
            (updateError, updateResult, updateResponse) => {
              if (!updateError) {
                assert.equal(updateResponse.statusCode, 204); // Precondition succeeded
                tableService.retrieveEntity<TestEntity>(
                  tableName,
                  entityInsert.PartitionKey._,
                  entityInsert.RowKey._,
                  (error, result) => {
                    assert.strictEqual(
                      result.myValue._,
                      entityInsert.myValue._,
                      "Value was incorrect on retrieved entity"
                    );
                    done();
                  }
                );
              } else {
                assert.ifError(updateError);
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

  it("Insert or Merge on an Entity that does not exist, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const entityToInsertOrMerge = createBasicEntityForTest();
    tableService.insertOrMergeEntity(
      tableName,
      entityToInsertOrMerge,
      (updateError, updateResult, updateResponse) => {
        if (updateError) {
          assert.ifError(updateError);
          done();
        } else {
          assert.strictEqual(updateResponse.statusCode, 200); // Service responds with 200
          tableService.retrieveEntity<TestEntity>(
            tableName,
            entityToInsertOrMerge.PartitionKey._,
            entityToInsertOrMerge.RowKey._,
            (error, result) => {
              assert.strictEqual(
                result.myValue._,
                entityToInsertOrMerge.myValue._,
                "Inserted value did not match"
              );
              done();
            }
          );
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

    tableService.insertEntity(
      tableName,
      batchEntity1,
      (initialInsertError, initialInsertResult) => {
        assert.ifError(initialInsertError);
        const batchEntity2 = createBasicEntityForTest();
        const entityBatch: Azure.TableBatch = new Azure.TableBatch();
        entityBatch.addOperation("INSERT", batchEntity2, { echoContent: true });
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
      }
    );
  });

  it("Insert and Merge entity via a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const batchEntity1 = createBasicEntityForTest();
    tableService.insertEntity(
      tableName,
      batchEntity1,
      (initialInsertError, initialInsertResult) => {
        assert.ifError(initialInsertError);
        const batchEntity2 = createBasicEntityForTest();
        const entityBatch: Azure.TableBatch = new Azure.TableBatch();
        entityBatch.addOperation("INSERT", batchEntity2, { echoContent: true });
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
              assert.strictEqual(updateResponse.statusCode, 202);
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
      }
    );
  });

  it("Insert and Delete entity via a batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const batchEntity1 = createBasicEntityForTest();
    tableService.insertEntity(
      tableName,
      batchEntity1,
      (initialInsertError, initialInsertResult) => {
        assert.ifError(initialInsertError);

        const batchEntity2 = createBasicEntityForTest();
        // Should fail
        // The batch request contains multiple changes with same row key. An entity can appear only once in a batch request.
        const entityBatch: Azure.TableBatch = new Azure.TableBatch();
        entityBatch.addOperation("INSERT", batchEntity2, { echoContent: true });
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

  // this covers the following issues
  // https://github.com/Azure/Azurite/issues/750
  // https://github.com/Azure/Azurite/issues/733
  // https://github.com/Azure/Azurite/issues/745
  it("Operates on batch items with complex row keys, @loki", (done) => {
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
        entityBatch.insertEntity(insertEntity3, { echoContent: true });
        entityBatch.insertEntity(insertEntity4, {});
        entityBatch.deleteEntity(insertEntity1);
        entityBatch.deleteEntity(insertEntity2);
        tableService.executeBatch(
          tableName,
          entityBatch,
          (batchError, batchResult, batchResponse) => {
            if (batchError) {
              assert.ifError(batchError);
              done();
            } else {
              assert.equal(batchResponse.statusCode, 202);
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

  // this covers https://github.com/Azure/Azurite/issues/741
  it("Operates on batch items with complex partition keys, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const insertEntity1 = createBasicEntityForTest();
    insertEntity1.PartitionKey._ =
      "@DurableTask.AzureStorage.Tests.AzureStorageScenarioTests+Orchestrations+AutoStartOrchestration+Responder";
    const insertEntity2 = createBasicEntityForTest();
    insertEntity2.PartitionKey._ =
      "@DurableTask.AzureStorage.Tests.AzureStorageScenarioTests+Orchestrations+AutoStartOrchestration+Responder";
    const insertEntity3 = createBasicEntityForTest();
    insertEntity3.PartitionKey._ =
      "@DurableTask.AzureStorage.Tests.AzureStorageScenarioTests+Orchestrations+AutoStartOrchestration+Responder";
    const insertEntity4 = createBasicEntityForTest();
    insertEntity4.PartitionKey._ =
      "@DurableTask.AzureStorage.Tests.AzureStorageScenarioTests+Orchestrations+AutoStartOrchestration+Responder";

    tableService.insertEntity<TestEntity>(tableName, insertEntity1, () => {
      tableService.insertEntity<TestEntity>(tableName, insertEntity2, () => {
        const entityBatch: Azure.TableBatch = new Azure.TableBatch();
        entityBatch.insertEntity(insertEntity3, { echoContent: true });
        entityBatch.insertEntity(insertEntity4, {});
        entityBatch.deleteEntity(insertEntity1);
        entityBatch.deleteEntity(insertEntity2);
        tableService.executeBatch(
          tableName,
          entityBatch,
          (batchError, batchResult, batchResponse) => {
            if (batchError) {
              assert.ifError(batchError);
              done();
            } else {
              assert.equal(batchResponse.statusCode, 202);
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

  it("Ensure Valid Etag format from Batch, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const batchEntity1 = createBasicEntityForTest();

    tableService.insertEntity<TestEntity>(tableName, batchEntity1, () => {
      const batchEntity2 = createBasicEntityForTest();
      const entityBatch: Azure.TableBatch = new Azure.TableBatch();
      entityBatch.addOperation("INSERT", batchEntity2, { echoContent: true });
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
              (error, result, response) => {
                if (error) {
                  assert.ifError(error);
                } else if (result) {
                  const entity: TestEntity = result;
                  assert.equal(entity.myValue._, batchEntity1.myValue._);

                  if (response !== null) {
                    const body: any = response?.body;
                    assert.notStrictEqual(body, null, "response empty");
                    if (body != null) {
                      assert.strictEqual(
                        body["odata.etag"].match(/(%3A)/).length,
                        2,
                        "did not find the expected number of escaped sequences"
                      );
                    }
                  }
                }
                done();
              }
            );
          }
        }
      );
    });
  });

  it("Should have a valid OData Metadata value when inserting an entity, @loki", (done) => {
    // https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity
    const entityInsert = createBasicEntityForTest();
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    tableService.insertEntity(
      tableName,
      entityInsert,
      (error, result, insertresponse) => {
        if (
          !error &&
          insertresponse !== undefined &&
          insertresponse.body !== undefined
        ) {
          const body = insertresponse.body as object;
          const meta: string = body["odata.metadata" as keyof object];
          assert.strictEqual(meta.endsWith("/@Element"), true);
          done();
        } else {
          assert.ifError(error);
          done();
        }
      }
    );
  });

  // ToDo: Move to Table level tests
  it("Should have a valid OData Metadata value when inserting a table, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const newTableName: string = getUniqueName("table");
    tableService.createTable(newTableName, (error, result, response) => {
      if (
        !error &&
        result !== undefined &&
        response !== undefined &&
        response.body !== undefined
      ) {
        const body = response.body as object;
        const meta: string = body["odata.metadata" as keyof object];
        // service response for this operation ends with /@Element
        assert.strictEqual(meta.endsWith("/@Element"), true);
        done();
      } else {
        assert.ifError(error);
        done();
      }
    });
  });
});
