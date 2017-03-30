'use strict';

const AError = require('./../Error'),
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
    validate(options) {
        if (!options.requestBlob) {
            throw new AError(ErrorCodes.BlobNotFound);
        }
        const name = options.requestBlob.name;
        const coll = options.collection;
        if (!coll || coll.chain().find({ name: { '$eq': name } }).data().length !== 1) {
            throw new AError(ErrorCodes.BlobNotFound);
        }
    }
}

module.exports = new BlobExists;