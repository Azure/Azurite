'use strict';

const AError = require('./../Error');

/*
 * Checks whether the blob has specific type.
 */
class IsOfBlobType {
    constructor() {
    }

    /** 
     * @param {Object} options - validation input
     * @param {String} options.blobType - The blob type that needs to be satisfied
     * @param {Object} options.requestBlob - The name of the request blob
     */
    validate(options) {
        return options.requestBlob.blobType === options.blobType
        
    }
}

module.exports = new IsOfBlobType;