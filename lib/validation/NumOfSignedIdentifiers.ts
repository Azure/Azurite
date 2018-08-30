/** @format */

import { AzuriteError }from './../core/AzuriteError';
import { ErrorCodes } from '../core/AzuriteError';

/**
 * Checks whether the number of signed identifiers is at most 5.
 * See https://docs.microsoft.com/rest/api/storageservices/fileservices/establishing-a-stored-access-policy for spec.
 */
class NumOfSignedIdentifiers {
  constructor() {}

    validate({ request = undefined }) {
        const si = request.payload;
        if ((si !== null || si !== undefined) && si.length > 5) {
            throw ErrorCodes.InvalidInput;
        }
    }
  }
}

export default new NumOfSignedIdentifiers();