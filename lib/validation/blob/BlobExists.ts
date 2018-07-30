constimport AError from "./../../core/AzuriteError";
  ErrorCodes  from "./../../core/ErrorCodes");

/*
 * Checks whether the blob exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class BlobExists {
  public validate({ blobProxy = undefined }) {
    if (blobProxy === undefined) {
      throw new AError(ErrorCodes.BlobNotFound);
    }
  }
}

export default new BlobExists();
