'use strict';

const AError = require('./../AzuriteError'),
    BlobTypes = require('./../Constants').BlobTypes,
    ErrorCodes = require('./../ErrorCodes');

class AppendPageBlobCreationSize {
    constructor() {
    }

    validate(options) {
        // Append and Page Blobs must not be larger than 0 bytes 
        if ((options.requestBlob.blobType === BlobTypes.AppendBlob ||
            options.requestBlob.blobType === BlobTypes.PageBlob) &&
            options.body.length > 0) {
            throw new AError(ErrorCodes.InvalidBlobType);
        }
        if (options.requestBlob.blobType === BlobTypes.BlockBlob &&
            options.body.length > 268435456) {
            throw new AError(ErrorCodes.RequestBodyTooLarge);
        }
    }
}

module.exports = new AppendPageBlobCreationSize();