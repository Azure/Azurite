'use strict';

const AError = require('./../AzuriteError'),
    ErrorCodes = require('./../ErrorCodes');

/**
 * Checks whether the number of signed identifiers is at most 5.
 * See https://docs.microsoft.com/rest/api/storageservices/fileservices/establishing-a-stored-access-policy for spec.
 */
class NumOfSignedIdentifiers {
    constructor() {
    }

    validate({ request = undefined }) {
        const si = request.azuritePayload;
        if ((si !== null || si !== undefined) && si.length > 5) {
            throw new AError(ErrorCodes.InvalidInput);
        }
    }
}

module.exports = new NumOfSignedIdentifiers();