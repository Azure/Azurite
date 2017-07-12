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
     * Based on the container name and blob it creates the according URI that is served by Azurite's web interface.  
     * 
     * @param {number} port 
     * @param {string} containerName 
     * @param {model.Blob} blob 
     * @returns 
     * 
     * @memberof Environment
    * */
    webStorageUri(port, containerName, blob) {
        return (blob.isVirtualDirectory() && !blob.isSnapshot()) 
            ? `http://localhost:${port}/blobs/${this.virtualDirUri}/${containerName}/${blob.publicName()}`
            : (blob.isSnapshot()) 
                ? `http://localhost:${port}/blobs/${this.snapshotUri}/${containerName}/${blob.publicName()}`
                : `http://localhost:${port}/blobs/${containerName}/${blob.name}`;
    }

    /**
     * Based on the blob name it creates the full path to the location on disk. 
     * 
     * Virtual directories are stored in a special folder that is not accessible through the Standard REST API.
     * This is to make sure that not special characters or words need to be reserved in the regular blob workspace.
     * Since virtual directories contain trailing slashes (which are invalid filename characters) we store the 
     * Base64 representation on disk. 
     * 
     * Snapshots are also stored in a special folder since we encode the snapshot date into the name as <blobname>-<snapshotId>.
     * 
     * @param {string} containerName 
     * @param {model.Blob} blob 
     * @returns Full path on disk
     * 
     * @memberof StorageManager
     */
    diskStorageUri(containerName, blob) {
        let containerPath;
        if (blob.isVirtualDirectory()) {
            containerPath = path.join(this.virtualDirPath, containerName);
        } else if (blob.isSnapshot()) {
            containerPath = path.join(this.snapshotPath, containerName);
        } else {
            containerPath = path.join(this.localStoragePath, containerName);
        }
        const blobPath = path.join(containerPath, blob.publicName());
        return (blob.isVirtualDirectory())
            ? blobPath
            : utils.escapeBlobDelimiter(blobPath);
    }
}

module.exports = new Environment();