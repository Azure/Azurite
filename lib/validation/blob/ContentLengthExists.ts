'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import { ErrorCodes } from '../../core/AzuriteError';

class ContentLengthExists {
    constructor() {
    }

    validate({ request = undefined }) {
        if (!request.httpProps[N.CONTENT_LENGTH]) {
            throw ErrorCodes.MissingContentLengthHeader;
        }
    }
}

export default new ContentLengthExists();