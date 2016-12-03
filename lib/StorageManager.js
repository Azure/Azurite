'use strict';

const env = require('./env'),
      path = require('path'),
      BbPromise = require('bluebird'),
      Loki = require('lokijs');

const fs = BbPromise.promisifyAll(require("fs"));

const TABLE_COL_NAME = 'tables';

class StorageManager {
    constructor(){
        this.db = new Loki(path.join(env.localStoragePath, '__azurite_db__.json')); 
        this.db.addCollection(TABLE_COL_NAME);
    }
    
    createContainer(name) {
        return fs.mkdir(path.join(env.localStoragePath, name))
            .then(() => {
                return BbPromise.try(() => {
                    console.log(`Successfully created container "${name}"`);
                    let tables = this.db.getCollection(TABLE_COL_NAME);
                    tables.insert({name: name});
                });
            });
    }
}