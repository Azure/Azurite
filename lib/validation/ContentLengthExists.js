'use strict';

const AError = require('./../Error');

class ContentLengthExists {
    constructor() {
    }

    validate(options) {
        if (!options.requestBlob.httpProps['Content-Length']) {
            throw new AError('MissingContentLengthHeader', 411, 'The Content-Length header was not specified.');
        }
    }
}

module.exports = new ContentLengthExists();