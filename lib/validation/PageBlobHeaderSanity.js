'use strict';

const AError = require('./../Error');

class PageBlobHeaderSanity {
    constructor() {
    }

    /** 
     * @param {Object} options - validation input
     * @param {String} options.requestBlob - The blob to be checked
     */
    validate(options) {
        const httpProps = options.requestBlob.httpProps,
            isClearSet = httpProps['x-ms-page-write'] === 'clear';
        if (isClearSet && httpProps['Content-Length'] !== 0) {
            throw new AError('InvalidHeaderValue', 400);
        }
        if (isClearSet && httpProps['Content-MD5']) {
            throw new AError('BadRequest', 400);
        }

        const range = httpProps['range'];
        // This is safe since range string has already been validated to be well-formed
        // in PageAlignment Validator.
        const parts = range.split('=')[1].split('-');
        if (!isClearSet) {
            const startByte = parseInt(parts[0]),
                endByte = parseInt(parts[1]);
            if (httpProps['Content-Length'] != (endByte - startByte) + 1) {
                throw new AError('InvalidHeaderValue', 400);
            }
        }
    }
}

module.exports = new PageBlobHeaderSanity;