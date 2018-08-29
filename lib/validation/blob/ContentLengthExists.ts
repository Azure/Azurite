'use strict';

import AError from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import ErrorCodes from './../../core/ErrorCodes';

class ContentLengthExists {
    constructor() {
    }

    validate({ request = undefined }) {
        if (!request.httpProps[N.CONTENT_LENGTH]) {
            throw new AError(ErrorCodes.MissingContentLengthHeader);
        }
    }
}

export default new ContentLengthExists();