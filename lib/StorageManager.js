'use strict';

const env = require('./env'),
    path = require('path'),
    BbPromise = require('bluebird'),
    Loki = require('lokijs'),
    fs = require('fs');

BbPromise.promisifyAll(require("fs"));

const CONTAINERS_COL_NAME = 'Containers';

class StorageManager {
    constructor() {
        this.dbName = '__azurite_db__.json'
    }

    init(localStoragePath) {
        this.dbPath = path.join(localStoragePath, this.dbName);
        this.db = BbPromise.promisifyAll(new Loki(this.dbPath));
        return fs.statAsync(this.dbPath)
            .then((stat) => {
                return this.db.loadDatabaseAsync(this.dbName);
            })
            .then((data) => {
                if (!this.db.getCollection(CONTAINERS_COL_NAME)) {
                    this.db.addCollection(CONTAINERS_COL_NAME);
                    return this.db.saveDatabaseAsync();
                }
            })
            .catch((e) => {
                if (e.code === 'ENOENT') {
                    // No DB hasn't been persisted initialized yet.
                    this.db.addCollection(CONTAINERS_COL_NAME);
                    return this.db.saveDatabaseAsync();
                }
                // This should never happen!
                console.error(`Failed to initialize database at "${this.dbPath}"`);
                throw e;
            });
    }

    createContainer(name) {
        let p = path.join(env.localStoragePath, name);
        return fs.mkdirAsync(p)
            .then(() => {
                let tables = this.db.getCollection(CONTAINERS_COL_NAME);
                tables.insert({ name: name });
                return this.db.saveDatabaseAsync();
            });
    }
}

module.exports = new StorageManager;