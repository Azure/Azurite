'use strict';

const env = require('./env'),
      path = require('path'),
      BbPromise = require('bluebird'),
      Loki = require('lokijs'),
      fs = require('fs');

BbPromise.promisifyAll(require("fs"));

const TABLE_COL_NAME = 'tables';

class StorageManager {
    constructor(){
        this.db = new Loki(path.join(env.localStoragePath, '__azurite_db__.json')); 
        this.db.addCollection(TABLE_COL_NAME);
    }
    
    createContainer(name) {
        let p = path.join(env.localStoragePath, name);
        return fs.mkdirAsync(p)
            .then(() => {
                let tables = this.db.getCollection(TABLE_COL_NAME);
                return tables.insert({name: name});
            });
    }
}

module.exports = new StorageManager;