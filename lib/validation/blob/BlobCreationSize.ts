'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { StorageEntityType as EntityType } from './../../core/Constants';
import { ErrorCodes } from '../../core/AzuriteError';

class BlobCreationSize {
    constructor() {
    }

    validate({ request = undefined }) {
        // Append and Page Blobs must not be larger than 0 bytes 
        if ((request.entityType === EntityType.AppendBlob ||
            request.entityType === EntityType.PageBlob) &&
            request.body.length > 0) {
            throw ErrorCodes.InvalidBlobType;
        }
        if (request.entityType === EntityType.BlockBlob &&
            request.body.length > 268435456) {
            throw ErrorCodes.RequestBodyTooLarge;
        }
    }
}

export default new BlobCreationSize();