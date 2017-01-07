'use strict';

const AError = require('./../Error');

class CompatibleBlobType {
    constructor() {
    }

    validate(options) {
        if (options.requestBlob.blobType !== options.updateBlob.blobType) {
            throw new AError('InvalidBlobType', 409);
        }
    }
}

module.exports = new CompatibleBlobType();