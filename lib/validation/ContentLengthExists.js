'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class ContentLengthExists {
    constructor() {
    }

    validate(options) {
        if (!options.requestBlob.httpProps['Content-Length']) {
            throw new AError(ErrorCodes.MissingContentLengthHeader);
        }
    }
}

module.exports = new ContentLengthExists();