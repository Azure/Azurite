'use strict';

const AError = require('./../../core/AzuriteError'),
    ErrorCodes = require('./../../core/ErrorCodes');


/*
 * Checks whether the blob has specific type.
 */
class IsOfBlobType {
    constructor() {
    }

    validate({ blobProxy = undefined, moduleOptions = undefined }) {
        if (blobProxy.original.entityType !== moduleOptions.entityType) {
            throw new AError(ErrorCodes.InvalidBlobType);
        }
    }
}

module.exports = new IsOfBlobType;