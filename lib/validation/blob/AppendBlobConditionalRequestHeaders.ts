import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

/**
 * Checks whether the following conditional request headers specific to an AppendBlob are satisfied.
 * See https://docs.microsoft.com/rest/api/storageservices/append-block for details.
 *
 * - x-ms-blob-condition-maxsize
 * - x-ms-blob-condition-appendpos
 *
 * @class AppendBlobConditionalRequestHeaders
 */
class AppendBlobConditionalRequestHeaders {
  public validate(request, blobProxy) {
    const maxSize = request.httpProps[N.BLOB_CONDITION_MAX_SIZE];
    const appendPos = request.httpProps[N.BLOB_CONDITION_APPENDPOS];

    if (
      maxSize !== undefined &&
      (blobProxy.original.size > maxSize ||
        blobProxy.original.size + request.body.length > maxSize)
    ) {
      throw new AzuriteError(ErrorCodes.MaxBlobSizeConditionNotMet);
    }
    if (appendPos !== undefined && blobProxy.original.size !== appendPos) {
      throw new AzuriteError(ErrorCodes.AppendPositionConditionNotMet);
    }
  }
}

export default new AppendBlobConditionalRequestHeaders();
