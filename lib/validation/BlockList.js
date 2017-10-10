'use strict';

const AError = require('./../AzuriteError'),
    env = require('./../env'),
    BlobExistsVal = require('./BlobExists'),
    ErrorCodes = require('./../ErrorCodes');

class BlockList {
    constructor() {
    }

    /**
     * Checks whether the blocklist is correct. It is correct if all block ids are existant in the database.
     */
    validate({ request = undefined, moduleOptions = undefined }) {
        const sm = moduleOptions.storageManager,
            blockList = request.payload;
        for (const block of blockList) {
            const blobId = env.blockId(request.containerName, request.blobName, block.id);
            const { blobProxy } = sm._getCollectionAndBlob(request.containerName, blobId);
            try {
                BlobExistsVal.validate({ blobProxy: blobProxy });
            } catch (e) {
                if (e.statusCode === 404) {
                    throw new AError(ErrorCodes.InvalidBlockList);
                } else {
                    throw e; // Something unexpected happened
                }
            }
        }
    }
}

module.exports = new BlockList();