'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class ConditionalRequestHeaders {
    constructor() {
    }

    /** 
     * Checks whether the following conditional request headers are satisfied.
     * - If-Modified-Since
     * - If-Unmodified-Since
     * - If-Match
     * - If-None-Match
     * 
     * @param {Object} options - validation input
     * @param {Object} options.requestBlob - The request blob
     * @param {Object} options.updateBlob - The to be updated blob (already exists in DB)
     */
    validate(options) {
        const requestBlob = options.requestBlob,
            updateBlob = options.updateBlob,
            lastModifiedDate = new Date(updateBlob.httpProps['Last-Modified']),
            ETag = updateBlob.httpProps['ETag'].toString;

        const shouldThrow =
            (new Date(requestBlob.httpProps['If-Modified-Since']) >= lastModifiedDate) ? true : false ||
            (new Date(requestBlob.httpProps['If-Unmodified-Since']) < lastModifiedDate) ? true : false ||
            (requestBlob.httpProps['If-Match'] !== ETag) ? true : false ||
            (requestBlob.httpProps['If-None-Match'] === ETag) ? true : false;

        if (shouldThrow) {
            throw new AError(ErrorCodes.PreconditionFailed);
        }
    }
}

module.exports = new ConditionalRequestHeaders();