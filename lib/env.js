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
     * Based on the request it creates the according URI that is served by Azurite's web interface.  
     * 
     * @param {any} request 
     * 
     * @memberof Environment
    * */
    webStorageUri(request) {
        return (request.isVirtualDirectory() && !request.isSnapshot())
            ? `http://localhost:${this.port}/blobs/${this.virtualDirUri}/${request.containerName}/${request.publicName()}`
            : (request.isSnapshot())
                ? `http://localhost:${this.port}/blobs/${this.snapshotUri}/${request.containerName}/${request.publicName()}`
                : `http://localhost:${this.port}/blobs/${request.containerName}/${request.publicName()}`;
    }

    /**
     * Based on the request it creates the full path to the location of a blob on disk. 
     * 
     * Virtual directories are stored in a special folder that is not accessible through the Standard REST API.
     * This is to make sure that not special characters or words need to be reserved in the regular blob workspace.
     * Since virtual directories contain trailing slashes (which are invalid filename characters) we store the 
     * Base64 representation on disk. 
     * 
     * Snapshots are also stored in a special folder since we encode the snapshot date into the name as <blobname>-<snapshotId>.
     * 
     * @param {AzuriteBlobRequest} request 
     * @param {any} parent if defined the path to the parent (block blobs) blob or origin (snapshot) of the block is returned in any case
     * @returns Full path on disk
     * 
     * @memberof Environment
     */
    diskStorageUri(request, parent) {
        let containerPath;
        if (request.isVirtualDirectory()) {
            containerPath = path.join(this.virtualDirPath, request.containerName);
        } else if (request.isSnapshot() && parent === true) {
            containerPath = path.join(this.localStoragePath, request.containerName);
        } else if (request.isSnapshot()) {
            containerPath = path.join(this.snapshotPath, request.containerName);
        } else if (request.blockId && parent === undefined) {
            const blockPath = path.join(this.commitsPath, request.blockName);
            return utils.escapeBlobDelimiter(blockPath);
        } else {
            containerPath = path.join(this.localStoragePath, request.containerName);
        }

        let blobPath;
        if (request.isSnapshot() && parent === true) {
            blobPath = path.join(containerPath, request.blobName);
        } else {
            blobPath = path.join(containerPath, request.publicName());
        }
        return (request.isVirtualDirectory())
            ? blobPath
            : utils.escapeBlobDelimiter(blobPath);
    }
}

module.exports = new Environment();