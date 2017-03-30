'use strict';

const AError = require('./../Error'),
    BlobTypes = require('./../Constants').BlobTypes;

class SupportedBlobType {
    constructor() {
    }

    /** 
     * @param {Object} options - validation input
     * @param {Object} options.collection - Reference to in-memory database
     * @param {Object} options.body - The body of the request (optional)
     * @param {String} options.containerName - The name of the container involved (optional)
     * @param {Object} options.requestBlob - The name of the request blob (optional)
     * @param {Object} options.updateBlob - The name of the to be updated blob (already exists in DB) (optional)
     */
    validate(options) {
        const requestBlob = options.requestBlob;
        if (requestBlob.blobType !== BlobTypes.AppendBlob &&
            requestBlob.blobType !== BlobTypes.BlockBlob &&
            requestBlob.blobType !== BlobTypes.PageBlob) {
            throw new AError('UnsupportedBlobType', 400, 'The blob type is invalid for this operation.');
        }
    }
}

module.exports = new SupportedBlobType();