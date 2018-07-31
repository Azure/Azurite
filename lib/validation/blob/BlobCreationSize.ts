import AzuriteError from "../../core/AzuriteError";
import { StorageEntityType } from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";

class BlobCreationSize {
  public validate(request) {
    // Append and Page Blobs must not be larger than 0 bytes
    if (
      (request.entityType === StorageEntityType.AppendBlob ||
        request.entityType === StorageEntityType.PageBlob) &&
      request.body.length > 0
    ) {
      throw new AzuriteError(ErrorCodes.InvalidBlobType);
    }
    if (
      request.entityType === StorageEntityType.BlockBlob &&
      request.body.length > 268435456
    ) {
      throw new AzuriteError(ErrorCodes.RequestBodyTooLarge);
    }
  }
}

export default new BlobCreationSize();
