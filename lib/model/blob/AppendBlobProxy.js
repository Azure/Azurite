'use strict';

const crypto = require('crypto'),
    BlobProxy = require('./BlobProxy'),
    HeaderNames = require('./HttpHeaderNames'),
    InternalAzuriteError = require('./../../InternalAzuriteError');

/**
 * Serves as a Append blob proxy to the corresponding LokiJS object. 
 * 
 * @class AppendBlobProxy
 */
class AppendBlobProxy extends BlobProxy {
    constructor(original, containerName) {
        super(original, container);
    }

    incrementCommittedBlockCount() {
        this.original[HeaderNames.BLOB_COMMITTED_BLOCK_COUNT] += 1;
    }
}

module.exports = AppendBlobProxy;