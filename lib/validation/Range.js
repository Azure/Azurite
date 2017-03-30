'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

/*
 * Checks whether the range header (and headers depending on it) are valid.
 */
class Range {
    constructor() {
    }

    /** 
     * @param {Object} options - validation input
     * @param {Object} options.collection - Reference to in-memory database
     * @param {Object} options.body - The body of the request (optional)
     * @param {String} options.containerName - The name of the container involved (optional)
     * @param {Object} options.requestBlob - The name of the request blob (optional)
     * @param {Object} options.updateBlob - The name of the to be updated blob (already exists in DB) (optional)
     */
    validate(options) {
        const httpProps = options.requestBlob.httpProps;
        const range = httpProps['x-ms-range'] || httpProps['range'] || undefined;
        const x_ms_range_get_content_md5 = httpProps['x-ms-range-get-content-md5'];
        // If this header is specified without the Range header, 
        // the service returns status code 400 (Bad Request).
        if (x_ms_range_get_content_md5 && httpProps['range'] === undefined) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }
        // If this header is set to true _and_ the range exceeds 4 MB in size, 
        // the service returns status code 400 (Bad Request).
        if (x_ms_range_get_content_md5 && this._isRangeExceeded(range)) {
            throw new AError(ErrorCodes.InvalidHeaderValue);
        }
    }

    /*
     * Checks whether the range is bigger than 4MB (which is not allowed when
     * x-ms-range-get-content-md5 is set to true ) 
     * If there is invalid data in that string, function returns false 
     * since boolean expression will contain at least one 'NaN'' in any invalid case.
     */
    _isRangeExceeded(range) {
        const pair = range.split('=')[1].split('-');
        const startByte = parseInt(pair[0]);
        const endByte = parseInt(pair[1]);
        return endByte - startByte > 4194304;
    }
}

module.exports = new Range();