import AzuriteError from "../../core/AzuriteError";
import { StorageEntityType } from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";

class SupportedBlobType {
  public validate(request) {
    if (
      request.entityType !== StorageEntityType.AppendBlob &&
      request.entityType !== StorageEntityType.BlockBlob &&
      request.entityType !== StorageEntityType.PageBlob
    ) {
      throw new AzuriteError(ErrorCodes.UnsupportedBlobType);
    }
  }
}

export default new SupportedBlobType();
