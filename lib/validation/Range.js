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

    validate({ request = undefined, blobProxy = undefined }) {
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

        if (!this._withinRange(blobProxy.original.size, range)) {
            throw new AError(ErrorCodes.InvalidRange);
        }
    }

    _withinRange(blobSize, range) {
        if (range === undefined) {
            return true;
        }
        const pair = range.split('=')[1].split('-');
        const startByte = parseInt(pair[0]);
        const endByte = parseInt(pair[1]);
        if (!isNaN(startByte) && !isNaN(endByte)) {
            // For example given a blob size of 1024 bytes:
            // - 1024-1024 is invalid
            // - 1023-1024 is valid
            // - 1023-1025 is invalid
            return startByte < blobSize && endByte <= blobSize;
        }
        // if the range is semantically incorrect we ignore it since this is
        // handled somewhere else
        return true;
    }

    /*
     * Checks whether the range is bigger than 4MB (which is not allowed when
     * x-ms-range-get-content-md5 is set to true ) 
     * If there is invalid data in that string, function returns false 
     * since boolean expression will contain at least one 'NaN'' in any invalid case.
     */
    _isRangeExceeded(range) {
        if (range === undefined) {
            return false;
        }
        const pair = range.split('=')[1].split('-');
        const startByte = parseInt(pair[0]);
        const endByte = parseInt(pair[1]);
        return endByte - startByte > 4194304;
    }
}

module.exports = new Range();