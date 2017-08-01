'use strict';

const AError = require('./../Error'),
    ErrorCodes = require('./../ErrorCodes');

class AppendBlobConditionalRequestHeaders {
    constructor() {
    }

    /** 
     * Checks whether the following conditional request headers specific to an AppendBlob are satisfied.
     * See https://docs.microsoft.com/rest/api/storageservices/append-block for details.
     * 
     * - x-ms-blob-condition-maxsize
     * - x-ms-blob-condition-appendpos
     * 
     * @param {Object} options - validation input
     * @param {Object} options.requestBlob - The request blob
     * @param {Object} options.updateItem - The to be updated blob (already exists in DB)
     * @param {String} options.bodySize - size of the request body in bytes
     */
    validate(options) {
        const requestBlob = options.requestBlob,
            updateItem = options.updateItem,
            bodySize = options.bodySize;

        const maxSize = requestBlob.httpProps['x-ms-blob-condition-maxsize'],
            appendPos = requestBlob.httpProps['x-ms-blob-condition-appendpos'];

        if (maxSize !== undefined && (updateItem.size > maxSize || (updateItem.size + bodySize) > maxSize)) {
            throw new AError(ErrorCodes.MaxBlobSizeConditionNotMet);
        }
        if (appendPos !== undefined && updateItem.size !== appendPos) {
            throw new AError(ErrorCodes.AppendPositionConditionNotMet);
        }
    }
}

module.exports = new AppendBlobConditionalRequestHeaders();
