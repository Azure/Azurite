'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

/*
 * Checks whether the blob has been committed yet as part of PUT BlockList.
 * Although a BlockBlob is created when the first block has been created it is not visible for operations
 * such as GET Blob.
 */
class BlobCommitted {
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
        const name = options.requestBlob.publicName();
        const coll = options.collection;
        if (!coll || coll.chain().find({
            '$and': [
                { name: { '$eq': name } },
                { committed: { '$eq': true } }
            ]
        }).data().length !== 1) {
            throw new AError(ErrorCodes.BlobNotFound);
        }
    }
}

module.exports = new BlobCommitted();