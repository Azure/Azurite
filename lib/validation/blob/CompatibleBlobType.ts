'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

class CompatibleBlobType {
    constructor() {
    }

    validate({ request = undefined, blobProxy = undefined }) {
        // skipped if blob is created, not updated
        if (blobProxy === undefined) {
            return;
        }
        if (request.entityType !== blobProxy.original.entityType) {
            throw ErrorCodes.InvalidBlobType;
        }
    }
}

export default new CompatibleBlobType();