'use strict';

const AError = require('./../AzuriteError'),
    BlobTypes = require('./../Constants').BlobTypes,
    ErrorCodes = require('./../ErrorCodes');

/*
 * Checks whether the item (container, blob) that is to be created already exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class PutBlobHeaders {
    constructor() {
    }

    validate(options) {
        const xmsBlobContentLength = options.requestBlob.httpProps['x-ms-blob-content-length'];
        const blobType = options.requestBlob.blobType;

        if (blobType !== BlobTypes.PageBlob && xmsBlobContentLength) {
            throw new AError(ErrorCodes.UnsupportedHeader);
        }
    }
}

module.exports = new PutBlobHeaders();