'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import { StorageEntityType as EntityType } from './../../core/Constants';
import { ErrorCodes } from '../../core/AzuriteError';

class PutBlobHeaders {
    constructor() {
    }

    validate({ request = undefined }) {
        const length = request.httpProps[N.BLOB_CONTENT_LENGTH];
        if (request.entityType === EntityType.PageBlob) {
            if (length && (length < 0 || length % 512 != 0)) {
                throw ErrorCodes.InvalidHeaderValue;
            }
        } else {
            if (length) {
                throw ErrorCodes.UnsupportedHeader;
            }
        }
    }
}

export default new PutBlobHeaders();
