// Tests in this file are using @azure/data-tables

import * as assert from "assert";
import * as Azure from "azure-storage";
import { configLogger } from "../../../src/common/Logger";
import TableServer from "../../../src/table/TableServer";
import {
  getUniqueName,
  overrideRequest,
  restoreBuildRequestOptions
} from "../../testutils";

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

describe("table Entity APIs test - Apostrophe Tests using Azure-Storage", () => {
  let server: TableServer;
  const tableService = Azure.createTableService(
    createConnectionStringForTest(testLocalAzuriteInstance)
  );

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
    restoreBuildRequestOptions(tableService);
    tableService.removeAllListeners();
    await server.close();
  });

  // https://github.com/Azure/Azurite/issues/1481
  it("01. Operates on batch items with double apostrophe in the middle, @loki", (done) => {
    requestOverride.headers = {
      Prefer: "return-content",
      accept: "application/json;odata=fullmetadata"
    };
    const singleApostrophePartition = "apos'strophe";
    const singleApostropheRowKey = "row'key";
    const doubleApostrophePartition = "apos''strophe";
    const doubleApostropheRowKey = "row''key";

    const testEntities1: TestEntity[] = [];
    // singleApostrophePartition tests
    // pk ' rk '
    const insertEntity1 = entityFactory.createBasicEntityForTest();
    insertEntity1.PartitionKey._ = singleApostrophePartition;
    insertEntity1.RowKey._ = singleApostropheRowKey + "1";
    testEntities1.push(insertEntity1);
    // pk ' rk ''
    const insertEntity2 = entityFactory.createBasicEntityForTest();
    insertEntity2.PartitionKey._ = singleApostrophePartition;
    insertEntity2.RowKey._ = doubleApostropheRowKey + "1";
    testEntities1.push(insertEntity2);
    // pk ' rk '
    const insertEntity3 = entityFactory.createBasicEntityForTest();
    insertEntity3.PartitionKey._ = singleApostrophePartition;
    insertEntity3.RowKey._ = singleApostropheRowKey + "2";
    testEntities1.push(insertEntity3);
    // pk ' rk ''
    const insertEntity4 = entityFactory.createBasicEntityForTest();
    insertEntity4.PartitionKey._ = singleApostrophePartition;
    insertEntity4.RowKey._ = doubleApostropheRowKey + "2";
    testEntities1.push(insertEntity4);

    // doubleApostrophePartition tests
    const testEntities2: TestEntity[] = [];
    // pk ' rk '
    const doubleEntity1 = entityFactory.createBasicEntityForTest();
    doubleEntity1.PartitionKey._ = doubleApostrophePartition;
    doubleEntity1.RowKey._ = singleApostropheRowKey + "1";
    testEntities2.push(doubleEntity1);
    // pk ' rk ''
    const doubleEntity2 = entityFactory.createBasicEntityForTest();
    doubleEntity2.PartitionKey._ = doubleApostrophePartition;
    doubleEntity2.RowKey._ = doubleApostropheRowKey + "1";
    testEntities2.push(doubleEntity2);
    // pk ' rk '
    const doubleEntity3 = entityFactory.createBasicEntityForTest();
    doubleEntity3.PartitionKey._ = doubleApostrophePartition;
    doubleEntity3.RowKey._ = singleApostropheRowKey + "2";
    testEntities2.push(doubleEntity3);
    // pk ' rk ''
    const doubleEntity4 = entityFactory.createBasicEntityForTest();
    doubleEntity4.PartitionKey._ = doubleApostrophePartition;
    doubleEntity4.RowKey._ = doubleApostropheRowKey + "2";
    testEntities2.push(doubleEntity4);

    let testCount = 0;
    // create Batch Transactions then delete batch transactions
    testInsertBatch(testEntities1, tableService, tableName).then(() => {
      testCount++;
      return testInsertBatch(testEntities2, tableService, tableName)
        .then(() => {
          testCount++;
          return testMergeBatch(testEntities1, tableService, tableName)
            .catch((error) => {
              assert.fail(error.message);
            })
            .then(() => {
              testCount++;
              return testMergeBatch(testEntities2, tableService, tableName)
                .catch((error) => {
                  assert.fail(error.message);
                })
                .then(() => {
                  testCount++;
                  return testDeleteBatch(testEntities1, tableService, tableName)
                    .catch((error) => {
                      assert.fail(error.message);
                    })
                    .then(() => {
                      testCount++;
                      return testDeleteBatch(
                        testEntities2,
                        tableService,
                        tableName
                      )
                        .catch((error) => {
                          assert.fail(error.message);
                        })
                        .then(() => {
                          done();
                        });
                    });
                })
                .catch((error) => {
                  assert.fail(error.message);
                });
            });
        })
        .catch((error) => {
          assert.fail(error.message);
        })
        .finally(() => {
          // Sanity check to make sure all tests ran
          // and that we have not missed any callbacks
          assert.strictEqual(testCount, 5);
        });
    });
  });

  it("02. Merge on an Entity with double quote in PartitionKey and RowKey, @loki", (done) => {
    const partitionKey = "pk double''quote string";
    const rowKey = "rk double''quote string";

    // Insert entity with the specific pk,rk
    const entityInsert = new TestEntity(partitionKey, rowKey, "value1");
    tableService.insertEntity(
      tableName,
      entityInsert,
      (insertError, insertResult, insertresponse) => {
        if (insertError) {
          assert.fail(insertError.message);
        } else {
          // merge entity with the specific pk,rk, to a different value
          const entityMerge = new TestEntity(partitionKey, rowKey, "value2");
          tableService.mergeEntity(
            tableName,
            entityMerge,
            (mergeError, updateResult, updateResponse) => {
              if (!mergeError) {
                assert.strictEqual(updateResponse.statusCode, 204); // Precondition succeeded

                // retrieve entity with the specific pk,rk, and validate value is updated
                tableService.retrieveEntity<TestEntity>(
                  tableName,
                  partitionKey,
                  rowKey,
                  (error, result) => {
                    if (error) {
                      assert.fail(error.message);
                    } else {
                      assert.strictEqual(result.PartitionKey._, partitionKey);
                      assert.strictEqual(result.RowKey._, rowKey);
                      assert.strictEqual(result.myValue._, "value2");
                      done();
                    }
                  }
                );
              } else {
                assert.fail(mergeError.message);
              }
            }
          );
        }
      }
    );
  });
});

function testInsertBatch(
  testEntities: TestEntity[],
  tableService: Azure.TableService,
  tableName: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const insertEntityBatch: Azure.TableBatch = new Azure.TableBatch();
    for (const entity of testEntities) {
      insertEntityBatch.insertEntity(entity, { echoContent: true });
    }
    tableService.executeBatch(
      tableName,
      insertEntityBatch,
      (batchError, batchResult, batchResponse) => {
        if (batchError) {
          reject(batchError);
        } else {
          assert.strictEqual(batchResponse.statusCode, 202);
          tableService.retrieveEntity<TestEntity>(
            tableName,
            testEntities[2].PartitionKey._,
            testEntities[2].RowKey._,
            (error: any, result, response) => {
              assert.strictEqual(
                response.statusCode,
                200,
                "We did not find the 3rd entity!"
              );
              tableService.retrieveEntity<TestEntity>(
                tableName,
                testEntities[3].PartitionKey._,
                testEntities[3].RowKey._,
                (error2: any, result2, response2) => {
                  assert.strictEqual(
                    response2.statusCode,
                    200,
                    "We did not find the 4th entity!"
                  );
                  tableService.retrieveEntity<TestEntity>(
                    tableName,
                    testEntities[0].PartitionKey._,
                    testEntities[0].RowKey._,
                    (error3: any, result3, response3) => {
                      assert.strictEqual(
                        response3.statusCode,
                        200,
                        "We did not find the 1st entity!"
                      );
                      tableService.retrieveEntity<TestEntity>(
                        tableName,
                        testEntities[1].PartitionKey._,
                        testEntities[1].RowKey._,
                        (error4: any, result4, response4) => {
                          assert.strictEqual(
                            response4.statusCode,
                            200,
                            "We did not find the 2nd entity!"
                          );
                          resolve();
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
}

function testDeleteBatch(
  testEntities: TestEntity[],
  tableService: Azure.TableService,
  tableName: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const insertEntityBatch: Azure.TableBatch = new Azure.TableBatch();
    for (const entity of testEntities) {
      insertEntityBatch.deleteEntity(entity);
    }
    tableService.executeBatch(
      tableName,
      insertEntityBatch,
      (batchError, batchResult, batchResponse) => {
        if (batchError) {
          reject(batchError);
        } else {
          assert.strictEqual(batchResponse.statusCode, 202);
          for (const subResponse of batchResult) {
            assert.strictEqual(
              subResponse.response.statusCode,
              204,
              "We did not delete the entity!"
            );
          }
          tableService.retrieveEntity<TestEntity>(
            tableName,
            testEntities[2].PartitionKey._,
            testEntities[2].RowKey._,
            (error: any, result, response) => {
              assert.strictEqual(
                response.statusCode,
                404,
                "We did not find the 3rd entity!"
              );
              tableService.retrieveEntity<TestEntity>(
                tableName,
                testEntities[3].PartitionKey._,
                testEntities[3].RowKey._,
                (error2: any, result2, response2) => {
                  assert.strictEqual(
                    response2.statusCode,
                    404,
                    "We did not find the 4th entity!"
                  );
                  tableService.retrieveEntity<TestEntity>(
                    tableName,
                    testEntities[0].PartitionKey._,
                    testEntities[0].RowKey._,
                    (error3: any, result3, response3) => {
                      assert.strictEqual(
                        response3.statusCode,
                        404,
                        "We did not find the 1st entity!"
                      );
                      tableService.retrieveEntity<TestEntity>(
                        tableName,
                        testEntities[1].PartitionKey._,
                        testEntities[1].RowKey._,
                        (error4: any, result4, response4) => {
                          assert.strictEqual(
                            response4.statusCode,
                            404,
                            "We did not find the 2nd entity!"
                          );
                          resolve();
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
}

function testMergeBatch(
  testEntities: TestEntity[],
  tableService: Azure.TableService,
  tableName: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const insertEntityBatch: Azure.TableBatch = new Azure.TableBatch();
    for (const entity of testEntities) {
      entity.myValue._ = "new value";
      insertEntityBatch.mergeEntity(entity);
    }
    tableService.executeBatch(
      tableName,
      insertEntityBatch,
      (batchError, batchResult, batchResponse) => {
        if (batchError) {
          reject(batchError);
        } else {
          assert.strictEqual(batchResponse.statusCode, 202);
          // the checks below deliberately do not follow the ordering
          // of the entity array
          tableService.retrieveEntity<TestEntity>(
            tableName,
            testEntities[2].PartitionKey._,
            testEntities[2].RowKey._,
            (error: any, result, response) => {
              assert.strictEqual(
                response.statusCode,
                200,
                "We did not find the 3rd entity!"
              );
              assert.strictEqual(
                result.myValue._,
                "new value",
                "We did not find the matching value on the 3rd entity!"
              );
              tableService.retrieveEntity<TestEntity>(
                tableName,
                testEntities[3].PartitionKey._,
                testEntities[3].RowKey._,
                (error2: any, result2, response2) => {
                  assert.strictEqual(
                    response2.statusCode,
                    200,
                    "We did not find the 4th entity!"
                  );
                  assert.strictEqual(
                    result2.myValue._,
                    "new value",
                    "We did not find the matching value on the 4th entity!"
                  );
                  tableService.retrieveEntity<TestEntity>(
                    tableName,
                    testEntities[0].PartitionKey._,
                    testEntities[0].RowKey._,
                    (error3: any, result3, response3) => {
                      assert.strictEqual(
                        response3.statusCode,
                        200,
                        "We did not find the 1st entity!"
                      );
                      assert.strictEqual(
                        result3.myValue._,
                        "new value",
                        "We did not find the matching value on the 1st entity!"
                      );
                      tableService.retrieveEntity<TestEntity>(
                        tableName,
                        testEntities[1].PartitionKey._,
                        testEntities[1].RowKey._,
                        (error4: any, result4, response4) => {
                          assert.strictEqual(
                            response4.statusCode,
                            200,
                            "We did not find the 2nd entity!"
                          );
                          assert.strictEqual(
                            result4.myValue._,
                            "new value",
                            "We did not find the matching value on the 2nd entity!"
                          );
                          resolve();
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
}
