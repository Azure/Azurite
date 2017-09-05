'use strict';

const AError = require('./../AzuriteError');

/*
 * Checks whether the blob has specific type.
 */
class IsOfBlobType {
    constructor() {
    }

    validate({request = undefined, moduleOptions = undefined }) {
        if (request.entityType !== moduleOptions.entityType) {
            throw new AError(ErrorCodes.InvalidBlobType);
        }
    }
}

module.exports = new IsOfBlobType;