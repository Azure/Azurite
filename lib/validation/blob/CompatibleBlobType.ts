import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";

class CompatibleBlobType {
  public validate(request, blobProxy) {
    // skipped if blob is created, not updated
    if (blobProxy === undefined) {
      return;
    }
    if (request.entityType !== blobProxy.original.entityType) {
      throw new AzuriteError(ErrorCodes.InvalidBlobType);
    }
  }
}

export default new CompatibleBlobType();
