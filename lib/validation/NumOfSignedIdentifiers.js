/** @format */

"use strict";

import AError from "./../core/AzuriteError";
import ErrorCodes from "./../core/ErrorCodes";

/**
 * Checks whether the number of signed identifiers is at most 5.
 * See https://docs.microsoft.com/rest/api/storageservices/fileservices/establishing-a-stored-access-policy for spec.
 */
class NumOfSignedIdentifiers {
  constructor() {}

  validate({ request = undefined }) {
    const si = request.payload;

    if (si && si.length > 5) {
      throw new AError(ErrorCodes.InvalidInput);
    }
  }
}

export default new NumOfSignedIdentifiers();
