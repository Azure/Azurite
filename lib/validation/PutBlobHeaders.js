'use strict';

const AError = require('./../AzuriteError'),
    N = require('./../model/HttpHeaderNames'),
    BlobTypes = require('./../Constants').BlobTypes,
    ErrorCodes = require('./../ErrorCodes');

class PutBlobHeaders {
    constructor() {
    }

    validate({ request = undefined }) {
        if (request.entityType !== BlobTypes.PageBlob && request.httpProps[N.BLOB_CONTENT_LENGTH]) {
            throw new AError(ErrorCodes.UnsupportedHeader);
        }
    }
}

module.exports = new PutBlobHeaders();