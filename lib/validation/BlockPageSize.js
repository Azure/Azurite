'use strict';

const AError = require('./../Error'),
    BlobTypes = require('./../Constants').BlobTypes;



/**
 * Validates whether PUT Block, PUT AppendBlob, and PUT Page operations adhere
 * to allowed maximum size.
 * 
 * @class BlockPageSize
 */
class BlockPageSize {
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
        const size = options.body.length || options.requestBlob.httpProps['Content-Length'];
        switch (options.requestBlob.blobType) {
            case BlobTypes.BlockBlob:
                // Blocks larger than 100MB are not allowed since API version 2016-05-31
                // see https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/put-block
                if (size > 104857600) {
                    throw new AErro("RequestBodyTooLarge", 413, 'The size of the request body exceeds the maximum size permitted.');
                }
                break;
            case BlobTypes.AppendBlob:
                // ApppendBlocks larger than 4MB are not allowed as per specification at
                // see https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/append-block
                if (size > 4194304) {
                    throw new AErro("RequestBodyTooLarge", 413, 'The size of the request body exceeds the maximum size permitted.');
                }
                break;
            case BlobTypes.PageBlob:
                // Pages larger than 4MB are not allowed as per specification at
                // https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/put-page
                if (size > 4194304) {
                    throw new AErro("RequestBodyTooLarge", 413, 'The size of the request body exceeds the maximum size permitted.');
                }
                break;
            default:
                throw new AError('InvalidBlobType', 409, 'The blob type is invalid for this operation.');
        }
    }
}

module.exports = new BlockPageSize;