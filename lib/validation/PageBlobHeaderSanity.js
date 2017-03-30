'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class PageBlobHeaderSanity {
    constructor() {
    }

    /** 
     * @param {Object} options - validation input
     * @param {String} options.requestBlob - The blob to be checked
     */
    validate(options) {
        const httpProps = options.requestBlob.httpProps;

        if (!httpProps['x-ms-page-write']) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }

        const isClearSet = httpProps['x-ms-page-write'] === 'CLEAR';
        if (isClearSet && httpProps['Content-Length'] !== 0) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }
        if (isClearSet && httpProps['Content-MD5']) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }

        const range = httpProps['range'];
        // This is safe since range string has already been validated to be well-formed
        // in PageAlignment Validator.
        const parts = range.split('=')[1].split('-');
        if (!isClearSet) {
            const startByte = parseInt(parts[0]),
                endByte = parseInt(parts[1]);
            if (httpProps['Content-Length'] != (endByte - startByte) + 1) {
                throw new AError(ErrorCodes.InvalidHeaderValue);
            }
        }
    }
}

module.exports = new PageBlobHeaderSanity;