'use strict';

const AError = require('./../../core/AzuriteError'),
    N = require('./../../core/HttpHeaderNames'),
    EntityType = require('./../../core/Constants').StorageEntityType,
    ErrorCodes = require('./../../core/ErrorCodes');

class PutBlobHeaders {
    constructor() {
    }

    validate({ request = undefined }) {
        if (request.entityType !== EntityType.PageBlob && request.httpProps[N.BLOB_CONTENT_LENGTH]) {
            throw new AError(ErrorCodes.UnsupportedHeader);
        }
    }
}

module.exports = new PutBlobHeaders();