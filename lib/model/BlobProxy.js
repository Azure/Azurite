'use strict';

const crypto = require('crypto'),
    InternalAzuriteError = require('./../InternalAzuriteError');

/**
 * Serves as a blob proxy to the corresponding LokiJS object. 
 * 
 * @class BlobProxy
 */
class BlobProxy {
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
        return this._updateETag(`${this.original.lastModified()}${JSON.stringify(this.original.metaProps)}${this.original.name}${this.containerName}`);
    }
}

module.exports = BlobProxy;