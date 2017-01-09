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

        const range = httpProps['range'],
            parts = range.split('-');
        if (!isClearSet) {
            const startByte = parseInt(parts[0]),
                endByte = parseInt(parts[1]);
            if (httpProps['Content-Length'] !== endByte - startByte) {
                throw new AError('InvalidHeaderValue', 400);
            }
        }
    }
}

module.exports = new PageBlobHeaderSanity;