'use strict';

const AError = require('./../Error'),
    BlobTypes = require('./../Constants').BlobTypes;

class AppendPageBlobCreationSize {
    constructor() {
    }

    validate(options) {
        // Append and Page Blobs must not be larger than 0 bytes 
        if ((options.requestBlob.blobType === BlobTypes.AppendBlob ||
            options.requestBlob.blobType === BlobTypes.PageBlob) &&
            options.body.length > 0) {
            throw new AError('InvalidBlobType', 409, 'The blob type is invalid for this operation.');
        }
        if (options.requestBlob.blobType === BlobTypes.BlockBlob &&
            options.body.length > 268435456) {
            throw new AError('RequestBodyTooLarge', 413, 'The size of the request body exceeds the maximum size permitted.');
        }
    }
}

module.exports = new AppendPageBlobCreationSize();