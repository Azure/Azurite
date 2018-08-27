'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';


/*
 * Checks whether the blob has specific type.
 */
class IsOfBlobType {
    constructor() {
    }

    validate({ blobProxy = undefined, moduleOptions = undefined }) {
        if (blobProxy.original.entityType !== moduleOptions.entityType) {
            throw ErrorCodes.InvalidBlobType;
        }
    }
}

export default new IsOfBlobType;