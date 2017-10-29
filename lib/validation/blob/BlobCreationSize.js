'use strict';

const AError = require('./../../AzuriteError'),
    EntityType = require('./../../Constants').StorageEntityType,
    ErrorCodes = require('./../../ErrorCodes');

class BlobCreationSize {
    constructor() {
    }

    validate({ request = undefined }) {
        // Append and Page Blobs must not be larger than 0 bytes 
        if ((request.entityType === EntityType.AppendBlob ||
            request.entityType === EntityType.PageBlob) &&
            request.body.length > 0) {
            throw new AError(ErrorCodes.InvalidBlobType);
        }
        if (request.entityType === EntityType.BlockBlob &&
            request.body.length > 268435456) {
            throw new AError(ErrorCodes.RequestBodyTooLarge);
        }
    }
}

module.exports = new BlobCreationSize();