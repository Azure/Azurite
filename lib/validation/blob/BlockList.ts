/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import env from './../../core/env';
import BlobExistsVal from './BlobExists';
import { ErrorCodes } from '../../core/AzuriteError';

class BlockList {
  constructor() {}

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
                    throw ErrorCodes.InvalidBlockList;
                } else {
                    throw e; // Something unexpected happened
                }
            }
        }
      }
    }
  }
}

export default new BlockList();