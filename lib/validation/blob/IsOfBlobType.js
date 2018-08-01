'use strict';

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';


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

export default new IsOfBlobType;