'use strict';

const AError = require('./../../AzuriteError'),
    N = require('./../../model/blob/HttpHeaderNames'),
    ErrorCodes = require('./../../ErrorCodes');

class PageBlobHeaderSanity {
    constructor() {
    }

    validate({ request = undefined }) {
        const httpProps = request.httpProps;

        if (!httpProps[N.PAGE_WRITE]) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }

        const isClearSet = httpProps[N.PAGE_WRITE] === 'CLEAR';
        if (isClearSet && httpProps[N.CONTENT_LENGTH] !== 0) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }
        if (isClearSet && httpProps[N.CONTENT_MD5]) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }

        const range = httpProps[N.RANGE];
        // This is safe since range string has already been validated to be well-formed
        // in PageAlignment Validator.
        const parts = range.split('=')[1].split('-');
        if (!isClearSet) {
            const startByte = parseInt(parts[0]),
                endByte = parseInt(parts[1]);
            if (httpProps[N.CONTENT_LENGTH] != (endByte - startByte) + 1) {
                throw new AError(ErrorCodes.InvalidHeaderValue);
            }
        }
    }
}

module.exports = new PageBlobHeaderSanity;