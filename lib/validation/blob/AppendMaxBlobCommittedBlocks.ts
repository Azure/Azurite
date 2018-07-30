import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

/**
 * Checks whether the total number of committed blocks present in this append blob does not exceed 50,000.
 *
 * @class AppendMaxBlobCommittedBlocks
 */
class AppendMaxBlobCommittedBlocks {
  public validate(blobProxy) {
    if (blobProxy.original[N.BLOB_COMMITTED_BLOCK_COUNT] + 1 > 50000) {
      throw new AzuriteError(ErrorCodes.BlockCountExceedsLimit);
    }
  }
}

export default new AppendMaxBlobCommittedBlocks();
