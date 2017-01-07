'use strict';

const AError = require('./../Error');

class ContentLengthExists {
    constructor() {
    }

    validate(options) {
        if (!options.requestBlob.httpProps['Content-Length']) {
            throw new AError('LengthRequired', 411);
        }
    }
}

module.exports = new ContentLengthExists();