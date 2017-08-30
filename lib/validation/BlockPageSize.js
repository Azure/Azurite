'use strict';

const AError = require('./../AzuriteError'),
    N = require('./../model/HttpHeaderNames'),
    BlobTypes = require('./../Constants').BlobTypes,
    ErrorCodes = require('./../ErrorCodes');

/**
 * Validates whether PUT Block, PUT AppendBlob, and PUT Page operations adhere
 * to allowed maximum size.
 * 
 * @class BlockPageSize
 */
class BlockPageSize {
    constructor() {
    }

    validate({ request = undefined, blobProxy = undefined }) {
        const size = request.body.length || request.httpProps[N.CONTENT_LENGTH];
        switch (blobProxy.original.entityType) {
            case BlobTypes.BlockBlob:
                // Blocks larger than 100MB are not allowed since API version 2016-05-31
                // see https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/put-block
                if (size > 104857600) {
                    throw new AErro(ErrorCodes.RequestBodyTooLarge);
                }
                break;
            case BlobTypes.AppendBlob:
                // ApppendBlocks larger than 4MB are not allowed as per specification at
                // see https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/append-block
                if (size > 4194304) {
                    throw new AErro(ErrorCodes.RequestBodyTooLarge);
                }
                break;
            case BlobTypes.PageBlob:
                // Pages larger than 4MB are not allowed as per specification at
                // https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/put-page
                if (size > 4194304) {
                    throw new AErro(ErrorCodes.RequestBodyTooLarge);
                }
                break;
            default:
                throw new AError(ErrorCodes.InvalidBlobType);
        }
    }
}

module.exports = new BlockPageSize;