'use strict';

const crypto = require('crypto'),
    StorageEntityProxy = require('./StorageEntityProxy'),
    etag = require('./../utils'),
    InternalAzuriteError = require('./../InternalAzuriteError');

/**
 * Serves as a blob proxy to the corresponding LokiJS object. 
 * 
 * @class BlobProxy
 */
class BlobProxy extends StorageEntityProxy {
    constructor(original, containerName) {
        super(original);
        if (!containerName) {
            throw new InternalAzuriteError('BlobProxy: missing containerName');
        }
        this.containerName = containerName;
    }

    /**
     * Updates and returns the strong ETag of the underlying blob. 
     * 
     * @returns 
     * @memberof BlobProxy
     */
    updateETag() {
        const etagValue = etag(`${this.lastModified()}${JSON.stringify(this.original.metaProps)}${this.original.name}${this.containerName}`);
        this.original.etag = `"${etagValue}"`;
        return this.original.etag;
    }
}

module.exports = BlobProxy;