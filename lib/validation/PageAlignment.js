'use strict';

const AError = require('./../Error');

/**
 * Validates the 512-byte alignment of a Page Blob.
 * Given that pages must be aligned with 512-byte boundaries, 
 * the start offset must be a modulus of 512 and the end offset must be a modulus of 512 – 1. 
 * Examples of valid byte ranges are 0-511, 512-1023, etc. 
 * 
 * @class PageAlignment
 */
class PageAlignment {
    constructor() {
    }

    /** 
     * @param {Object} options - validation input
     * @param {Object} options.requestBlob - The name of the request blob (optional)
     */
    validate(options) {
        const range = options.requestBlob.httpProps['range'];
        const re = new RegExp(/bytes=[0-9]+-[0-9]+/);
        if (!re.test(range)) {
            throw new AError('InvalidHeaderValue', 400);
        }
        const parts = range.split('=')[1].split('-');
        const startByte = parseInt(parts[0]),
            endByte = parseInt(parts[1]);
        if (startByte % 512 !== 0 || ((endByte+1) - startByte)  % 512 !== 0) {
            throw new AError('InvalidPageRange', 416);
        }
    }
}

module.exports = new PageAlignment;