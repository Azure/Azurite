/** @format */

"use strict";

import AError from './../../core/AzuriteError';
import N from './../../core/HttpHeaderNames';
import ErrorCodes from './../../core/ErrorCodes';

/**
 * Checks whether the total number of committed blocks present in this append blob does not exceed 50,000.
 *
 * @class AppendMaxBlobCommittedBlocks
 */
class AppendMaxBlobCommittedBlocks {
  constructor() {}

  validate({ blobProxy = undefined }) {
    if (blobProxy.original[N.BLOB_COMMITTED_BLOCK_COUNT] + 1 > 50000) {
      throw new AError(ErrorCodes.BlockCountExceedsLimit);
    }
  }
}

export default new AppendMaxBlobCommittedBlocks();
