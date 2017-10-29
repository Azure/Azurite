'use strict';

const AError = require('./../../AzuriteError'),
    ErrorCodes = require('./../../ErrorCodes');

/*
 * Checks whether the blob exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class BlobExists {
    constructor() {
    }

    validate({ blobProxy = undefined }) {
        if (blobProxy === undefined) {
            throw new AError(ErrorCodes.BlobNotFound);
        }
    }
}

module.exports = new BlobExists;