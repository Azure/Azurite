'use strict';

const AError = require('./../AzuriteError'),
    ErrorCodes = require('./../ErrorCodes');

class CompatibleBlobType {
    constructor() {
    }

    validate({ request = undefined, blobProxy = undefined }) {
        // skipped if blob is created, not updated
        if (blobProxy === undefined) {
            return;
        }
        if (request.entityType !== blobProxy.entityType) {
            throw new AError(ErrorCodes.InvalidBlobType);
        }
    }
}

module.exports = new CompatibleBlobType();