'use strict';

const AError = require('./../AzuriteError'),
N = require('./../model/HttpHeaderNames'),
    ErrorCodes = require('./../ErrorCodes');

class ContentLengthExists {
    constructor() {
    }

    validate({ request = undefined }) {
        if (!request.httpProps[N.CONTENT_LENGTH]) {
            throw new AError(ErrorCodes.MissingContentLengthHeader);
        }
    }
}

module.exports = new ContentLengthExists();