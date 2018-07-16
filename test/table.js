const chai = require('chai'),
    chaiHttp = require('chai-http'),
    should = chai.should(),
    expect = chai.expect,
    BbPromise = require('bluebird'),
    fs = BbPromise.promisifyAll(require("fs-extra")),
    Azurite = require('./../lib/AzuriteBlob'),
    rp = require('request-promise'),
    path = require('path'),
    xml2js = require('xml2js')
    azureStorage = require('azure-storage');

chai.use(chaiHttp);

const tableName = 'testtable';

const tableService = azureStorage.createTableService("UseDevelopmentStorage=true");
const entGen = azureStorage.TableUtilities.entityGenerator;

describe('Table HTTP Api', () => {
    const azurite = new Azurite();
    const tableEntity = {
        PartitionKey: entGen.String('azurite').toString(),
        RowKey: entGen.String('1').toString(),
        description: entGen.String('foo').toString(),
        dueDate: entGen.DateTime(new Date(Date.UTC(2018, 12, 25)))
    };

    const tableEntity2 = {
        PartitionKey: entGen.String('azurite').toString(),
        RowKey: entGen.String('2').toString(),
        description: entGen.String('foo').toString(),
        dueDate: entGen.DateTime(new Date(Date.UTC(2018, 12, 26)))
    };

    before(() => {  
        const location = path.join(process.env.AZURITE_LOCATION, 'TABLE');
        return azurite.init({ l: location, silent: 'true', overwrite: 'true' })
            .then(() =>  tableService.createTableIfNotExists(tableName, function(error, result, response) {
                tableService.insertEntity(tableName, tableEntity, function(error, result, response) {
                });
                tableService.insertEntity(tableName, tableEntity2, function(error, result, response) {
                });
            }));
    });

    after(() => azurite.close());

    describe('GET Table Entity', () => {
        it('By PartitionKey and RowKey', (done) => {
            tableService.retrieveEntity(tableName, tableEntity.PartitionKey, tableEntity.RowKey, function(error, result, response) {
                result.should.have.PartitionKey(tableEntity.PartitionKey);
                result.should.have.RowKey(tableEntity.RowKey);
                result.should.have.description(tableEntity.description);
                result.should.have.dueDate(tableEntity.dueDate);
            });

            done();
        });

        it('All', (done) => {
            const query = new azureStorage.TableQuery();
            tableService.queryEntities(tableName, query, null, function(error, result, response) {
                assert.lengthOf(result, 2, 'array has length of 2');
            });

            done();
        });
    });
});