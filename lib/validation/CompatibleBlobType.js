'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class CompatibleBlobType {
    constructor() {
    }

    validate(options) {
        if (options.requestBlob.blobType !== options.updateBlob.blobType) {
            throw new AError(ErrorCodes.InvalidBlobType);
        }
    }
}

module.exports = new CompatibleBlobType();