/** @format */

const chai = require("chai"),
  chaiHttp = require("chai-http"),
  should = chai.should(),
  expect = chai.expect,
  BbPromise = require("bluebird"),
  fs = BbPromise.promisifyAll(require("fs-extra")),
  Azurite = require("../lib/AzuriteTable"),
  rp = require("request-promise"),
  path = require("path"),
  xml2js = require("xml2js"),
  azureStorage = require("azure-storage");

chai.use(chaiHttp);

const tableName = "testtable";
// after testing, we need to clean up the DB files etc that we create.
// I wanted to shorten the cycles while debugging so create a new path
// with each pass of the debugger
const tableTestPath =
  new Date()
    .toISOString()
    .replace(/:/g, "")
    .replace(/\./g, "") + "_TABLE_TESTS";
const tableService = createDevTableService();
const entGen = azureStorage.TableUtilities.entityGenerator;
const partitionKeyForTest = "azurite";
const rowKeyForTestEntity1 = "1";
const rowKeyForTestEntity2 = "2";
const EntityNotFoundErrorMessage = 'The specified entity does not exist.';

// use this to tune for the storage API response time on write.
const tableWriteTimeout = 250;

describe("Table HTTP Api tests", () => {
  const azurite = new Azurite();
  const tableEntity1 = {
    PartitionKey: entGen.String(partitionKeyForTest),
    RowKey: entGen.String(rowKeyForTestEntity1),
    description: entGen.String("foo"),
    dueDate: entGen.DateTime(new Date(Date.UTC(2018, 12, 25))),
  };

  const tableEntity2 = {
    PartitionKey: entGen.String(partitionKeyForTest),
    RowKey: entGen.String(rowKeyForTestEntity2),
    description: entGen.String("bar"),
    dueDate: entGen.DateTime(new Date(Date.UTC(2018, 12, 26))),
  };

  let entity1Created = false;

  // set us up the tests!
  const testDBLocation = path.join(process.env.AZURITE_LOCATION, tableTestPath);

  before(() => {
    azurite
      .init({
        l: testDBLocation,
        silent: "true",
        overwrite: "true",
      })
      //.then(() => tableService.createTableIfNotExists(tableName, function (error, result, response) {
      // would be better to use "createTableIfNotExists" but we may need to make changes server side for this to work
      .then(() =>
        tableService.createTable(tableName, function (error, result, response) {
          tableService.insertEntity(tableName, tableEntity1, function (
            error,
            result,
            response
          ) {
            if (error === null) {
              entity1Created = true;
              tableService.insertEntity(tableName, tableEntity2, function (
                error,
                result,
                response
              ) {
                if (error === null) {
                }
              });
            } else {
              throw error;
            }
          });
        })
      );
  });

  // JSON response described here (but we are using storage SDK)
  // https://docs.microsoft.com/en-us/rest/api/storageservices/query-entities
  /*
      { "value":[  
          {  
              "PartitionKey":"Customer",  
              "RowKey":"Name",  
              "Timestamp":"2013-08-22T00:20:16.3134645Z",  
              etc...
      */
  // The value validation below works for both Azure Cloud Table Storage and Azurite's API
  // if you make changes, please ensure that you test against both
  describe("GET Table Entities", () => {
    it("should retrieve Entity 1 by PartitionKey and RowKey", (done) => {
      // there is some race condition sometimes, depending on the speed of the testing system
      // currently this delay solves it, until I can fix the before statement to deal
      // with a promise for DB creation, and wrap test entity creation in said promise
      // even though  the initialization of Azurite should be promisified already, this is prone
      // to error.
      if (entity1Created === false) {
        const getE1 = setTimeout(() => {
          singleEntityTest(done);
        }, tableWriteTimeout);
      } else {
        singleEntityTest(done);
      }
    });

    function singleEntityTest(cb) {
      // I create a new tableService, as the oringal above was erroring out
      //  with a socket close if I reuse it
      const retrievalTableService = createDevTableService();
      retrievalTableService.retrieveEntity(
        tableName,
        partitionKeyForTest,
        rowKeyForTestEntity1,
        function (error, result, response) {
          expect(error).to.equal(null);
          expect(result).to.not.equal(undefined);
          expect(result).to.not.equal(null);
          expect(result.PartitionKey._).to.equal(partitionKeyForTest);
          expect(result.RowKey._).to.equal(rowKeyForTestEntity1);
          expect(result.description._).to.equal(tableEntity1.description._);
          expect(result.dueDate._.toISOString().split(".")[0] + "Z").to.equal(
            new Date(Date.UTC(2018, 12, 25)).toISOString().split(".")[0] + "Z"
          );
          cb();
        }
      );
    }

    it("should retrieve all Entities", (done) => {
      const query = new azureStorage.TableQuery();
      const retrievalTableService = createDevTableService();
      retrievalTableService.queryEntities(tableName, query, null, function(
        error,
        results,
        response
      ) {
        expect(error).to.equal(null);
        expect(results.entries.length).to.equal(2);
        const sortedResults = results.entries.sort();
        expect(sortedResults[0].description._).to.equal(
          tableEntity1.description._
        );
        expect(sortedResults[1].description._).to.equal(
          tableEntity2.description._
        );
        expect(sortedResults[0].RowKey._).to.equal(rowKeyForTestEntity1);
        expect(
          sortedResults[0].dueDate._.toISOString().split(".")[0] + "Z"
        ).to.equal(
          new Date(Date.UTC(2018, 12, 25)).toISOString().split(".")[0] + "Z"
        );
        done();
      });
    });

    it("should fail to retrieve a non-existing row with 404 EntityNotFound", (done) => {
      if (entity1Created === false) {
        const getE1 = setTimeout(() => {
          missingEntityTest(done);
        }, tableWriteTimeout);
      } else {
        missingEntityTest(done);
      }
    });

    function missingEntityTest(cb) {
      const faillingLookupTableService = createDevTableService();
      faillingLookupTableService.retrieveEntity(
        tableName,
        partitionKeyForTest,
        "unknownRowKey",
        function (error, result, response) {
          expect(error.message).to.equal(EntityNotFoundErrorMessage);
          expect(response.statusCode).to.equal(404);
          cb();
        }
      );
    }

    // this test performs a query, rather than a retrieve (which is just a different implementation via
    // the SDK, but currently lands in the same place in our implementation which is using LokiJs)
    it("should fail to find a non-existing entity with 404 EntityNotFound", (done) => {
      if (entity1Created === false) {
        const getE1 = setTimeout(() => {
          missingEntityFindTest(done);
        }, tableWriteTimeout);
      } else {
        missingEntityFindTest(done);
      }
    });

    function missingEntityFindTest(cb) {
      const query = new azureStorage.TableQuery()
        .top(5)
        .where("RowKey eq ?", "unknownRowKeyForFindError");
      const faillingFindTableService = createDevTableService();
      faillingFindTableService.queryEntities(tableName, query, null, function(
        error,
        result,
        response
      ) {
        expect(error.message).to.equal(EntityNotFoundErrorMessage);
        expect(response.statusCode).to.equal(404);
        cb();
      });
    }

    it("should not have an ETag header", (done) => {
      const retrievalTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
      retrievalTableService.retrieveEntity(
        tableName,
        partitionKeyForTest,
        rowKeyForTestEntity1,
        function (error, result, response) {
          expect(response.headers).not.to.have.property("etag");
          const query = new azureStorage.TableQuery();
          retrievalTableService.queryEntities(tableName, query, null, function (
            error,
            results,
            response
          ) {
            expect(response.headers).not.to.have.property("etag");
            done();
          });
        });
    });
  });

  describe("PUT and Insert Table Entites", () => {
    it("should have an ETag response header", (done) => {
      const insertEntityTableService = createDevTableService();
      const insertionEntity = {
        PartitionKey: entGen.String(partitionKeyForTest),
        RowKey: entGen.String("3"),
        description: entGen.String("qux"),
        dueDate: entGen.DateTime(new Date(Date.UTC(2018, 12, 26))),
      };

      // Request is made by default with "return-no-content" when using the storage-sdk
      insertEntityTableService.insertEntity(
        tableName,
        insertionEntity,
        {
          echoContent: false,
        },
        function (error, result, response) {
          expect(response.headers).to.have.property("etag");
          done();
        }
      );
    });

    it("should return a valid object in the result object when creating an Entity in TableStorage using return no content", (done) => {
      const insertEntityTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
      const insertionEntity = {
        PartitionKey: entGen.String(partitionKeyForTest),
        RowKey: entGen.String("5"),
        description: entGen.String("qux"),
        dueDate: entGen.DateTime(new Date(Date.UTC(2018, 12, 26))),
      };

      // Request is made by default with "return-no-content" when using the storage-sdk
      insertEntityTableService.insertEntity(
        tableName,
        insertionEntity,
        {
          echoContent: false,
        },
        function (error, result, response) {
          if (error !== null) {
            throw error;
          }
          // etag format is currently different to that returned from Azure and x-ms-version 2018-03-28
          expect(response.statusCode).to.equal(204);
          expect(result).to.not.equal(undefined);
          expect(result).to.have.property(".metadata");
          expect(result[".metadata"]).to.have.property("etag");
          done();
        }
      );
    });
  });

  describe("PUT and Replace Entity operations", (done) => {
    it("should have an ETag response header", (done) => {
      const retrievalTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
      retrievalTableService.retrieveEntity(
        tableName,
        partitionKeyForTest,
        rowKeyForTestEntity1,
        function (error, result, response) {
          if (error !== null) {
            throw error;
          }
          retrievalTableService.replaceEntity(
            tableName,
            result,
            function (error, result, response) {
              if (error !== null) {
                throw error;
              }
              expect(response.statusCode).to.be.equal(204);
              expect(response.headers).to.have.property("etag");
              done();
            }
          );
        });
    });
    it("should fail if If-Match header doesn't match entity's etag", (done) => {
      const updateEntityTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );

      updateEntityTableService.retrieveEntity(
        tableName,
        partitionKeyForTest,
        rowKeyForTestEntity1,
        function (error, result, response) {
          expect(error).to.equal(null);

          result[".metadata"].etag = "W/\"newvalue\"";

          updateEntityTableService.replaceEntity(
            tableName,
            result,
            function (error, result, response) {
              expect(response.statusCode).to.equal(412); // invalid pre-condition
              done();
            }
          )
        }
      )
    });
    it("should return 204 if If-Match header matches entity's etag", (done) => {
      const updateEntityTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );

      updateEntityTableService.retrieveEntity(
        tableName,
        partitionKeyForTest,
        rowKeyForTestEntity1,
        function (error, result, response) {
          expect(error).to.equal(null);
          updateEntityTableService.replaceEntity(
            tableName,
            result,
            function (error, result, response) {
              expect(response.statusCode).to.equal(204); // no-content
              done();
            }
          )
        }
      )
    });
  });

  describe("PUT and Insert Or Replace Entity", (done) => {
    it("should have an ETag response header", (done) => {
      const retrievalTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
      retrievalTableService.retrieveEntity(
        tableName,
        partitionKeyForTest,
        rowKeyForTestEntity1,
        function (error, result, response) {
          retrievalTableService.insertOrReplaceEntity(
            tableName,
            result,
            function (error, result, response) {
              expect(response.headers).to.have.property("etag");
              done();
            }
          );
        });
    });
  });

  describe("MERGE and Merge Entity operations", (done) => {
    it("should have an ETag response header", (done) => {
      const mergeTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
      mergeTableService.retrieveEntity(
        tableName,
        partitionKeyForTest,
        rowKeyForTestEntity1,
        function (error, result, response) {
          mergeTableService.mergeEntity(
            tableName,
            result,
            function (error, result, response) {
              expect(response.headers).to.have.property("etag");
              done();
            }
          );
        });
    });
  });

  describe("MERGE and Merge Or Replace Entity", (done) => {
    it("should have an ETag response header", (done) => {
      const mergeTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
      mergeTableService.retrieveEntity(
        tableName,
        partitionKeyForTest,
        rowKeyForTestEntity1,
        function (error, result, response) {
          mergeTableService.insertOrMergeEntity(
            tableName,
            result,
            function (error, result, response) {
              expect(response.headers).to.have.property("etag");
              done();
            }
          );
        });
    });
  });

  describe("DELETE and Delete Entity operations", (done) => {
    it("should not have an ETag response header", (done) => {
      const deleteTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );

      const tempEntity = {
        PartitionKey: entGen.String(partitionKeyForTest),
        RowKey: entGen.String("4"),
        description: entGen.String("qux"),
        dueDate: entGen.DateTime(new Date(Date.UTC(2018, 12, 26))),
      };

      // Request is made by default with "return-no-content" when using the storage-sdk
      deleteTableService.insertEntity(
        tableName,
        tempEntity,
        {
          echoContent: false,
        },
        function (error, result, response) {
          if (error !== null) {
            throw error;
          }
          deleteTableService.deleteEntity(
            tableName,
            tempEntity,
            function (error, response) {
              if (error !== null) {
                throw error;
              }
              expect(response.headers).to.not.have.property("etag");
              done();
            });
        }
      );
    });
  });

  after(() => azurite.close());
});

function createDevTableService() {
  const svc = azureStorage.createTableService(
    "UseDevelopmentStorage=true"
  );

  // Disable keep-alive connections
  svc.enableGlobalHttpAgent = true;

  return svc;
}
