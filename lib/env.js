'use strict';

const path = require('path'),
    BbPromise = require('bluebird'),
    fs = BbPromise.promisifyAll(require("fs-extra"));

let initialized = false;

class Environment {
    constructor() {
    }

    init(options) {
        if (initialized) {
            return;
        }
        initialized = true;
        this.azuriteRootPath = options.l || options.location || './';
        this.silent = options.s || options.silent;
        this.dbName = '__azurite_db__.json';
        this.localStoragePath = path.join(this.azuriteRootPath, '__blobstorage__');
        this.commitsPath = path.join(this.azuriteRootPath, '__commits__');
        this.azuriteDBPath = path.join(this.azuriteRootPath, this.dbName);
        this.emulatedStorageAccountName = 'devstoreaccount1';
        this.port = options.p || options.port || 10000;
        return fs.mkdirsAsync(this.localStoragePath)
            .then(() => {
                return fs.mkdirsAsync(this.commitsPath);
            })
    }

    storageUrl(port, container, blob) {
        return `http://localhost:${port}/${container}/${blob}`;
    }
}

module.exports = new Environment();