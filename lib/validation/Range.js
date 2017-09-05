'use strict';

const AError = require('./../AzuriteError'),
    N = require('./../model/HttpHeaderNames'),
    ErrorCodes = require('./../ErrorCodes');

/*
 * Checks whether the range header (and headers depending on it) are valid.
 */
class Range {
    constructor() {
    }

    validate({ request = undefined }) {
        const range = request.httpProps[N.RANGE];
        const x_ms_range_get_content_md5 = request.httpProps[N.RANGE_GET_CONTENT_MD5];
        // If this header is specified without the Range header, 
        // the service returns status code 400 (Bad Request).
        // We are using raw 'range' string here since docs at 
        // https://docs.microsoft.com/de-de/azure/container-instances/container-instances-orchestrator-relationship
        // do not mention x-ms-range header explictly
        if (x_ms_range_get_content_md5 && request.httpProps['range'] === undefined) {
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