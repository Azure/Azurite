'use strict';

const Loki = require('lokijs'),
    BbPromise = require('bluebird'),
    fs = require("fs-extra"),
    fsn = BbPromise.promisifyAll(require("fs")),
    AzuriteTableResponse = require('./../../model/table/AzuriteTableResponse'),
    TableProxy = require('./../../model/table/TableProxy'),
    EntityProxy = require('./../../model/table/EntityProxy'),
    EntityGenerator = require('./../../model/table/EntityGenerator'),
    Tables = require('./../Constants').TableStorageTables,
    env = require('./../../core/env');

class TableStorageManager {
    constructor() {
    }

    init() {
        this.db = BbPromise.promisifyAll(new Loki(env.azuriteDBPathTable, { autosave: true, autosaveInterval: 5000 }));
        return fsn.statAsync(env.azuriteDBPathTable)
            .then((stat) => {
                return this.db.loadDatabaseAsync({});
            })
            .then((data) => {
                if (!this.db.getCollection(Tables.Tables)) {
                    this.db.addCollection(Tables.Tables);
                }
                return this.db.saveDatabaseAsync();
            })
            .catch((e) => {
                if (e.code === 'ENOENT') {
                    // No DB has been persisted / initialized yet.
                    this.db.addCollection(Tables.Tables);
                    return this.db.saveDatabaseAsync();
                }
                // This should never happen!
                console.error(`Failed to initialize database at "${env.azuriteDBPathTable}"`);
                throw e;
            });
    }

    createTable(request) {
        this.db.addCollection(request.tableName);
        const coll = this.db.getCollection(Tables.Tables);
        const tableEntity = EntityGenerator.generateTable(request.tableName);
        const proxy = new TableProxy(coll.insert(tableEntity));
        return BbPromise.resolve(new AzuriteTableResponse({ proxy: proxy }));
    }

    insertEntity(request) {
        const proxy = this._createEntity(request.tableName, request.payload);
        return BbPromise.resolve(new AzuriteTableResponse({ proxy: proxy }));
    }

    _getTable(name) {
        const coll = this.db.getCollection(Tables.Tables);
        const result = coll.chain()
            .find({ name: name })
            .data();
        return (result.length === 0) ? undefined : new TableProxy(result[0]);
    }

    _getEntity(tableName, partitionKey, rowKey) {
        const coll = this.db.getCollection(tableName);
        if (coll === null) {
            return undefined;
        }
        const result = coll.chain()
            .find({
                '$and':
                    [
                        {
                            PartitionKey: { '$eq': partitionKey }
                        },
                        {
                            RowKey: { '$eq': rowKey }
                        }
                    ]
            })
            .data();
        return (result.length === 0) ? undefined : new EntityProxy(result[0]);
    }

    _createEntity(tableName, rawEntity) {
        const coll = this.db.getCollection(tableName),
            entity = EntityGenerator.generateEntity(rawEntity, tableName),
            entityProxy = new EntityProxy(coll.insert(entity));
        return entityProxy;
    }
}

module.exports = new TableStorageManager();