'use strict';

const path = require('path');

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
        this.dbName = '__azurite_db__.json';
        this.localStoragePath = path.join(this.azuriteRootPath, '__blobstorage__');
        this.azuriteDBPath = path.join(this.azuriteRootPath, this.dbName);
        this.emulatedStorageAccountName = 'devstoreaccount1';
        this.port = options.p || options.port || 10000;
    }

    storageUrl(port, container, blob) {
        return `http://localhost:${port}/${container}/${blob}`;
    }
}

module.exports = new Environment();