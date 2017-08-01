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
     * @param {Object} options.updateItem - The to be updated blob (already exists in DB)
     * @param {String} options.operationType - can be any of 'read', 'write'
     */
    validate(options) {
        const requestBlob = options.requestBlob,
            updateItem = options.updateItem,
            lastModifiedVal = new Date(updateItem.httpProps['Last-Modified']),
            ETagVal = updateItem.meta.revision.toString(),
            ifMatchVal = requestBlob.httpProps['If-Match'],
            ifNoneMatchVal = requestBlob.httpProps['If-None-Match'],
            ifModifiedSinceVal = (requestBlob.httpProps['If-Modified-Since']) ? new Date(requestBlob.httpProps['If-Modified-Since']) : undefined,
            ifUnmodifiedSinceVal = (requestBlob.httpProps['If-Unmodified-Since']) ? new Date(requestBlob.httpProps['If-Unmodified-Since']) : undefined;

        const ifModifiedSince = ifModifiedSinceVal < lastModifiedVal, // operation will be performed only if it has been modified since the specified time
            ifUnmodifiedSince = ifUnmodifiedSinceVal >= lastModifiedVal, // operation will be performed only if it has _not_ been modified since the specified time
            ifMatch = ifMatchVal !== undefined && ifMatchVal === ETagVal,
            ifNoneMatch = ifNoneMatchVal !== undefined && ifNoneMatchVal !== ETagVal;

        switch (options.operationType) {
            case 'read':
                if ((ifMatchVal !== undefined && !ifMatch) ||
                    (ifUnmodifiedSinceVal !== undefined && !ifUnmodifiedSince)) {
                    throw new AError(ErrorCodes.ConditionNotMetWrite); // 412
                }

                if ((ifNoneMatchVal !== undefined && !ifNoneMatch) ||
                    (ifModifiedSinceVal && !ifModifiedSince)) {
                    throw new AError(ErrorCodes.ConditionNotMetRead); // 304
                }
                break;
            case 'write':
                if (ifMatchVal !== undefined && !ifMatch ||
                    ifUnmodifiedSinceVal !== undefined && !ifUnmodifiedSince ||
                    ifNoneMatchVal !== undefined && !ifNoneMatch ||
                    ifModifiedSinceVal !== undefined && !ifModifiedSince) {
                    throw new AError(ErrorCodes.ConditionNotMetWrite); // 412
                }
                break;
        }
    }
}

module.exports = new ConditionalRequestHeaders();