import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import * as Constants from "./../../core/Constants";
/**
 * Checks whether the a pending copy operation already exists at the destination.
 *
 * @class CopyStatus
 */
class CopyStatus {
  public validate(blobProxy) {
    if (
      blobProxy !== undefined &&
      blobProxy.original.copyStatus === Constants.CopyStatus.PENDING
    ) {
      throw new AzuriteError(ErrorCodes.PendingCopyOperation);
    }
  }
}

export default new CopyStatus();
