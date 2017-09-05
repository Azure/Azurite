'use strict';

const AError = require('./../AzuriteError'),
    ErrorCodes = require('./../ErrorCodes'),
    EntityType = require('./../Constants').StorageEntityType;

class SupportedBlobType {
    constructor() {
    }

    validate({ request = undefined }) {
        if (request.entityType !== EntityType.AppendBlob &&
            request.entityType !== EntityType.BlockBlob &&
            request.entityType !== EntityType.PageBlob) {
            throw new AError(ErrorCodes.UnsupportedBlobType);
        }
    }
}

module.exports = new SupportedBlobType();