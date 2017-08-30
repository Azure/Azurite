'use strict';

const AError = require('./../AzuriteError'),
    BlobTypes = require('./../Constants').BlobTypes,
    ErrorCodes = require('./../ErrorCodes');

class BlobCreationSize {
    constructor() {
    }

    validate({ request = undefined }) {
        // Append and Page Blobs must not be larger than 0 bytes 
        if ((request.entityType === BlobTypes.AppendBlob ||
            request.entityType === BlobTypes.PageBlob) &&
            request.body.length > 0) {
            throw new AError(ErrorCodes.InvalidBlobType);
        }
        if (request.entityType === BlobTypes.BlockBlob &&
            request.body.length > 268435456) {
            throw new AError(ErrorCodes.RequestBodyTooLarge);
        }
    }
}

module.exports = new BlobCreationSize();