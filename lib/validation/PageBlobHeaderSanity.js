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
        const httpProps = options.requestBlob.httpProps;

        if (!httpProps['x-ms-page-write']) {
            throw new AError('InvalidHeaderValue', 400, 'The value provided for one of the HTTP headers was not in the correct format.');
        }

        const isClearSet = httpProps['x-ms-page-write'] === 'CLEAR';
        if (isClearSet && httpProps['Content-Length'] !== 0) {
            throw new AError('InvalidHeaderValue', 400, 'The value provided for one of the HTTP headers was not in the correct format.');
        }
        if (isClearSet && httpProps['Content-MD5']) {
            throw new AError('BadRequest', 400, 'The value provided for one of the HTTP headers was not in the correct format.');
        }

        const range = httpProps['range'];
        // This is safe since range string has already been validated to be well-formed
        // in PageAlignment Validator.
        const parts = range.split('=')[1].split('-');
        if (!isClearSet) {
            const startByte = parseInt(parts[0]),
                endByte = parseInt(parts[1]);
            if (httpProps['Content-Length'] != (endByte - startByte) + 1) {
                throw new AError('InvalidHeaderValue', 400, 'The value provided for one of the HTTP headers was not in the correct format.');
            }
        }
    }
}

module.exports = new PageBlobHeaderSanity;