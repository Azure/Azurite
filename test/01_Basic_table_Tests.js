const chai = require('chai'),
    chaiHttp = require('chai-http'),
    should = chai.should(),
    expect = chai.expect,
    BbPromise = require('bluebird'),
    fs = BbPromise.promisifyAll(require("fs-extra")),
    Azurite = require('./../../Azurite/lib/AzuriteTable'),
    rp = require('request-promise'),
    path = require('path'),
    xml2js = require('xml2js')
azureStorage = require('azure-storage');

chai.use(chaiHttp);

const tableName = 'testtable';
// after testing, we need to clean up the DB files etc that we create.
// I wanted to shorten the cycles while debugging so create a new path 
// with each pass of the debugger
var tableTestPath = new Date().toISOString().replace(/:/g, "").replace(/\./g, "") + '_TABLE_TESTS';
const tableService = azureStorage.createTableService("UseDevelopmentStorage=true");
const entGen = azureStorage.TableUtilities.entityGenerator;
const partitionKeyForTest = 'azurite';
const rowKeyForTestEntity1 = '1';
const rowKeyForTestEntity2 = '2';


describe('Table HTTP Api tests', () => {
    const azurite = new Azurite();
    const tableEntity1 = {
        PartitionKey: entGen.String(partitionKeyForTest),
        RowKey: entGen.String(rowKeyForTestEntity1),
        description: entGen.String('foo'),
        dueDate: entGen.DateTime(new Date(Date.UTC(2018, 12, 25)))
    };

    const tableEntity2 = {
        PartitionKey: entGen.String(partitionKeyForTest),
        RowKey: entGen.String(rowKeyForTestEntity2),
        description: entGen.String('bar'),
        dueDate: entGen.DateTime(new Date(Date.UTC(2018, 12, 26)))
    };

    var entity1Created = false;

    // set us up the tests!
    const testDBLocation = path.join(process.env.AZURITE_LOCATION, tableTestPath);

    before(() => {
        azurite.init({ l: testDBLocation, silent: 'true', overwrite: 'true' })
            //.then(() => tableService.createTableIfNotExists(tableName, function (error, result, response) {
            // would be better to use "createTableIfNotExists" but we may need to make changes server side for this to work
            .then(() => tableService.createTable(tableName, function (error, result, response) {
                tableService.insertEntity(tableName, tableEntity1, function (error, result, response) {
                    if (error === null) {
                        entity1Created = true;
                        tableService.insertEntity(tableName, tableEntity2, function (error, result, response) {
                            if (error === null) {
                            }
                        });
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
    describe('GET Table Entities', () => {
        it('should retrieve Entity 1 by PartitionKey and RowKey', (done) => {
            // there is some race condition sometimes, depending on the speed of the testing system
            // currently this delay solves it, until I can fix the before statement to deal
            // with a promise for DB creation, and wrap test entity creation in said promise
            // even though  the initialization of Azurite should be promisified already, this is prone
            // to error. 
            if (entity1Created === false) {
                var getE1 = setTimeout(() => {
                    singleEntityTest(done);
                }, 500);
            }
            else {
                singleEntityTest(done);
            }
        });

        function singleEntityTest(cb) {
            // I create a new tableService, as the oringal above was erroring out, with a socket close if I reuse it
            let retrievalTableService = azureStorage.createTableService("UseDevelopmentStorage=true");
            retrievalTableService.retrieveEntity(tableName, partitionKeyForTest, rowKeyForTestEntity1, function (error, result, response) {
                expect(error).to.equal(null);
                expect(result).to.not.equal(undefined);
                expect(result).to.not.equal(null);
                expect(result.PartitionKey._).to.equal(partitionKeyForTest);
                expect(result.RowKey._).to.equal(rowKeyForTestEntity1);
                expect(result.description._).to.equal(tableEntity1.description._);
                expect(result.dueDate._.toISOString().split('.')[0] + "Z").to.equal(new Date(Date.UTC(2018, 12, 25)).toISOString().split('.')[0] + "Z");
                cb();
            });
        }

        it('should retrieve all Entities', (done) => {
            const query = new azureStorage.TableQuery();
            let retrievalTableService = azureStorage.createTableService("UseDevelopmentStorage=true");
            retrievalTableService.queryEntities(tableName, query, null, function (error, results, response) {
                expect(error).to.equal(null);
                expect(results.entries.length).to.equal(2);
                let sortedResults = results.entries.sort();
                expect(sortedResults[0].description._).to.equal(tableEntity1.description._);
                expect(sortedResults[1].description._).to.equal(tableEntity2.description._);
                expect(sortedResults[0].RowKey._).to.equal(rowKeyForTestEntity1);
                expect(sortedResults[0].dueDate._.toISOString().split('.')[0] + "Z").to.equal(new Date(Date.UTC(2018, 12, 25)).toISOString().split('.')[0] + "Z");
                done();
            });
        });
    });

    after(() => azurite.close());
});
