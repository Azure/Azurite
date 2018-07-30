import AzuriteError from "../../core/AzuriteError";
import { StorageEntityType } from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

class PutBlobHeaders {
  public validate(request) {
    const length = request.httpProps[N.BLOB_CONTENT_LENGTH];
    if (request.entityType === StorageEntityType.PageBlob) {
      if (length && (length < 0 || length % 512 !== 0)) {
        throw new AzuriteError(ErrorCodes.InvalidHeaderValue);
      }
    } else {
      if (length) {
        throw new AzuriteError(ErrorCodes.UnsupportedHeader);
      }
    }
  }
}

export default new PutBlobHeaders();
