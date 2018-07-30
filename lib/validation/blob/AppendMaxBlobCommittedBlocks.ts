constimport AError from "./../../core/AzuriteError";
  N  from "./../../core/HttpHeaderNames"),
  ErrorCodes  from "./../../core/ErrorCodes");

/**
 * Checks whether the total number of committed blocks present in this append blob does not exceed 50,000.
 *
 * @class AppendMaxBlobCommittedBlocks
 */
class AppendMaxBlobCommittedBlocks {
  public validate({ blobProxy = undefined }) {
    if (blobProxy.original[N.BLOB_COMMITTED_BLOCK_COUNT] + 1 > 50000) {
      throw new AError(ErrorCodes.BlockCountExceedsLimit);
    }
  }
}

export default new AppendMaxBlobCommittedBlocks();
