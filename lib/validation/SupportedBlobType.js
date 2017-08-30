'use strict';

const AError = require('./../AzuriteError'),
    ErrorCodes = require('./../ErrorCodes'),
    BlobTypes = require('./../Constants').BlobTypes;

class SupportedBlobType {
    constructor() {
    }

    validate({ request = undefined }) {
        if (request.entityType !== BlobTypes.AppendBlob &&
            request.entityType !== BlobTypes.BlockBlob &&
            request.entityType !== BlobTypes.PageBlob) {
            throw new AError(ErrorCodes.UnsupportedBlobType);
        }
    }
}

module.exports = new SupportedBlobType();