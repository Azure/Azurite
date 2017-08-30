'use strict';

const AError = require('./../AzuriteError'),
    ErrorCodes = require('./../ErrorCodes');

/*
 * Checks whether the blob exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class BlobExists {
    constructor() {
    }

    /** 
     * @param {Object} options - validation input
     * @param {Object} options.collection - Reference to in-memory database
     * @param {String} options.requestBlob - The blob to be checked
     */
    validate({ blobProxy = undefined }) {
        if (blobProxy === undefined) {
            throw new AError(ErrorCodes.BlobNotFound);
        }
    }
}

module.exports = new BlobExists;