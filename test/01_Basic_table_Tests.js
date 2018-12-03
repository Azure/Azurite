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
const tableService = azureStorage.createTableService(
  "UseDevelopmentStorage=true"
);
const entGen = azureStorage.TableUtilities.entityGenerator;
const partitionKeyForTest = "azurite";
const rowKeyForTestEntity1 = "1";
const rowKeyForTestEntity2 = "2";
const EntityNotFoundErrorMessage =
  '<?xml version="1.0" encoding="utf-8"?><Error><Code>EntityNotFound</Code><Message>The specified entity does not exist.</Message></Error>';

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
        tableService.createTable(tableName, function(error, result, response) {
          tableService.insertEntity(tableName, tableEntity1, function(
            error,
            result,
            response
          ) {
            if (error === null) {
              entity1Created = true;
              tableService.insertEntity(tableName, tableEntity2, function(
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
        }, 500);
      } else {
        singleEntityTest(done);
      }
    });

    function singleEntityTest(cb) {
      // I create a new tableService, as the oringal above was erroring out
      //  with a socket close if I reuse it
      const retrievalTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
      retrievalTableService.retrieveEntity(
        tableName,
        partitionKeyForTest,
        rowKeyForTestEntity1,
        function(error, result, response) {
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
      const retrievalTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
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
        }, 500);
      } else {
        missingEntityTest(done);
      }
    });

    function missingEntityTest(cb) {
      const faillingLookupTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
      faillingLookupTableService.retrieveEntity(
        tableName,
        partitionKeyForTest,
        "unknownRowKey",
        function(error, result, response) {
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
        }, 500);
      } else {
        missingEntityFindTest(done);
      }
    });

    function missingEntityFindTest(cb) {
      const query = new azureStorage.TableQuery()
        .top(5)
        .where("RowKey eq ?", "unknownRowKeyForFindError");
      const faillingFindTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
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

    it("should retrive single-element collection of entities when only one entity is returned by the query", (done) => {
      const query = new azureStorage.TableQuery()
      .top(1)
      .where("RowKey eq ?", rowKeyForTestEntity1);
  
      const retrievalTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
  
      retrievalTableService.queryEntities(tableName, query, null, function(
        error,
        result,
        response
      ) {
        expect(error).to.equal(null);
        expect(response.body.value.length).to.equal(1);
        expect(result.entries.length).to.equal(1);
        expect(response.statusCode).to.equal(200);
        done();
      });
    });
  });

  describe("PUT and Insert Table Entites", () => {
    it("should return a valid object in the result object when creating an Entity in TableStorage using return no content", (done) => {
      const insertEntityTableService = azureStorage.createTableService(
        "UseDevelopmentStorage=true"
      );
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
        function(error, result, response) {
          // etag format is currently different to that returned from Azure and x-ms-version 2018-03-28
          expect(response.statusCode).to.equal(204);
          expect(result).to.not.equal(undefined);
          expect(result[".metadata"].etag).to.not.equal(undefined);
          done();
        }
      );
    });
  });

  after(() => azurite.close());
});
