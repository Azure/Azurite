constimport AError from "./../../core/AzuriteError";
  ErrorCodes  from "./../../core/ErrorCodes"),
  CopyStat  from "./../../core/Constants").CopyStatus;

/**
 * Checks whether the a pending copy operation already exists at the destination.
 *
 * @class CopyStatus
 */
class CopyStatus {
  public validate({ blobProxy = undefined }) {
    if (
      blobProxy !== undefined &&
      blobProxy.original.copyStatus === CopyStat.PENDING
    ) {
      throw new AError(ErrorCodes.PendingCopyOperation);
    }
  }
}

export default new CopyStatus();
