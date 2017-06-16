'use strict';

const path = require('path'),
    BbPromise = require('bluebird'),
    fs = BbPromise.promisifyAll(require("fs-extra"));

let initialized = false;

class Environment {
    constructor() {
    }

    init(options) {
        if (initialized && !options.overwrite) {
            return BbPromise.resolve();
        }
        initialized = true;
        this.azuriteRootPath = options.l || options.location || process.cwd();
        this.silent = options.s || options.silent;
        this.dbName = '__azurite_db__.json';
        this.virtualDirUri = 'virtualdirs';
        this.snapshotUri = 'snapshots';
        this.localStoragePath = path.join(this.azuriteRootPath, '__blobstorage__');
        this.commitsPath = path.join(this.azuriteRootPath, '__commits__');
        this.virtualDirPath = path.join(this.azuriteRootPath, '__virtualdirs__');
        this.snapshotPath = path.join(this.azuriteRootPath, '__snapshots__');
        this.azuriteDBPath = path.join(this.azuriteRootPath, this.dbName);
        this.emulatedStorageAccountName = 'devstoreaccount1';
        this.port = options.p || options.port || 10000;
        return fs.mkdirsAsync(this.localStoragePath)
            .then(() => {
                return fs.mkdirsAsync(this.commitsPath);
            })
    }

    storageUrl(port, container, blob) {
        return (blob.isVirtualDirectory() && !blob.isSnapshot()) 
            ? `http://localhost:${port}/blobs/${this.virtualDirUri}/${container}/${blob.publicName()}`
            : (blob.isSnapshot()) 
                ? `http://localhost:${port}/blobs/${this.snapshotUri}/${container}/${blob.publicName()}`
                : `http://localhost:${port}/blobs/${container}/${blob.name}`;
    }
}

module.exports = new Environment();