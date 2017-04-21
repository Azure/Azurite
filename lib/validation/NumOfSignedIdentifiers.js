'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

/**
 * Checks whether the number of signed identifiers is at most 5.
 * See https://docs.microsoft.com/rest/api/storageservices/fileservices/establishing-a-stored-access-policy for spec.
 */
class NumOfSignedIdentifiers {
    constructor() {
    }

    validate(options) {
        if (options.model !== null && options.model.SignedIdentifier.length > 5) {
            throw new AError(ErrorCodes.InvalidInput);
        }
    }
}

module.exports = new NumOfSignedIdentifiers();