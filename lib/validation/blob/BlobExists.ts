import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";

/*
 * Checks whether the blob exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class BlobExists {
  public validate(blobProxy) {
    if (blobProxy === undefined) {
      throw new AzuriteError(ErrorCodes.BlobNotFound);
    }
  }
}

export default new BlobExists();
