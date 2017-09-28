'use strict';

const utils = require('./utils'),
    path = require('path'),
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

    /**
     * Based on the request it creates the according URI that is served by Azurite's internal web interface 
     * directly powered by Node's static file server.
     * 
     * @param {any} request 
     * 
     * @memberof Environment
    * */
    webStorageUri(request) {
        return `http://localhost:${this.port}/blobs/${request.id}`;
    }

    
    /**
     * Creates the full path to the location of a blob on disk based on its ID. 
     * 
     * @param {any} id 
     * @returns full path to blob on disk
     * @memberof Environment
     */
    diskStorageUri(id) {
        return path.join(this.localStoragePath, id);
    }

    //////////
    // We prepend a specific character to guarantee unique ids.
    // This is neccessary sinde otherwise snapshot IDs could overlap with blob IDs could overlap with page IDs, for example.
    blobId(containerName, blobName) {
        return Buffer.from(`A${containerName}${blobName}`, 'utf8').toString('base64');
    }

    blockId(containerName, blobName, blockId) {
        return Buffer.from(`B${containerName}${blobName}${blockId}`, 'utf8').toString('base64');
    }

    snapshotId(containerName, blobName, date) {
        return Buffer.from(`C${containerName}${blobName}${date}`, 'utf8').toString('base64');
    }

    pageId(containerName, blobName) {
        return Buffer.from(`D${containerName}${blobName}`, 'utf8').toString('base64');
    }
}

module.exports = new Environment();