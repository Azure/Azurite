/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import { ErrorCodes } from '../../core/AzuriteError';

/**
 * Checks whether the total number of committed blocks present in this append blob does not exceed 50,000.
 *
 * @class AppendMaxBlobCommittedBlocks
 */
class AppendMaxBlobCommittedBlocks {
  constructor() {}

    validate({ blobProxy = undefined }) {
        if (blobProxy.original[N.BLOB_COMMITTED_BLOCK_COUNT] + 1 > 50000) {
            throw ErrorCodes.BlockCountExceedsLimit;
        }
    }
  }
}

export default new AppendMaxBlobCommittedBlocks();