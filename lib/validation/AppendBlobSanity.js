'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class AppendBlobSanity {
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
        const blobMaxSize = (options.requestBlob.httpProps['x-ms-blob-condition-maxsize'])
            ? parseInt(options.requestBlob.httpProps['x-ms-blob-condition-maxsize'])
            : undefined;
        const blobAppendPos = (options.requestBlob.httpProps['x-ms-blob-condition-appendpos'])
            ? parseInt(options.requestBlob.httpProps['x-ms-blob-condition-appendpos'])
            : undefined;

        // Expected Offset?
        if (blobAppendPos && blobAppendPos !== options.updateBlob.size) {
            throw new AError(ErrorCodes.PreconditionFailed);
        }
        // Size not beyond expected maximum?
        if (blobMaxSize && options.blobMaxSize < (options.body.length + options.updateBlob.size)) {
            throw new AError(ErrorCodes.PreconditionFailed);
        }
        // No more than 50.000 committed blocks?
        if (options.updateBlob.httpProps['x-ms-blob-committed-block-count'] > 50000) {
            throw new AError(ErrorCodes.BlockCountExceedsLimit);
        }
        return options;
    }
}

module.exports = new AppendBlobSanity();