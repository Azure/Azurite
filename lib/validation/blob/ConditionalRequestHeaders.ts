import AzuriteError from "../../core/AzuriteError";
import { StorageEntityType, Usage } from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

class ConditionalRequestHeaders {
  /**
   * Checks whether the following conditional request headers are satisfied.
   * - If-Modified-Since
   * - If-Unmodified-Since
   * - If-Match
   * - If-None-Match
   */
  public validate(request, containerProxy, blobProxy, moduleOptions) {
    const proxy =
      request.entityType === StorageEntityType.Container
        ? containerProxy
        : blobProxy;
    const ifMatchVal = request.httpProps[N.IF_MATCH];
    const ifNoneMatchVal = request.httpProps[N.IF_NONE_MATCH];
    const ifModifiedSinceVal = request.httpProps[N.IF_MODFIFIED_SINCE]
      ? new Date(request.httpProps[N.IF_MODFIFIED_SINCE])
      : undefined;
    const ifUnmodifiedSinceVal = request.httpProps[N.IF_UNMODIFIED_SINCE]
      ? new Date(request.httpProps[N.IF_UNMODIFIED_SINCE])
      : undefined;
    const usage = moduleOptions.usage;

    // If the storage has not been created yet, but conditional headers are specified the operation fails with 412
    if (proxy === undefined) {
      if (ifMatchVal) {
        throw new AzuriteError(ErrorCodes.ConditionNotMetWrite); // 412
      }
      return;
    }
    // If wildcard character is specified, perform the operation only if the resource does not exist, and fail the operation if it does exist.
    // Resource does not exist if there is no proxy available or if there is a proxy available but the blob has not been committed yet.
    if (
      ifNoneMatchVal === "*" &&
      (blobProxy === undefined || blobProxy.original.committed === true)
    ) {
      throw new AzuriteError(ErrorCodes.BlobAlreadyExists);
    }

    const ETagVal = `\"${proxy.original.etag}\"`;
    const lastModifiedVal = new Date(proxy.lastModified());
    const ifModifiedSince = ifModifiedSinceVal < lastModifiedVal; // operation will be performed only if it has been modified since the specified time
    const ifUnmodifiedSince = ifUnmodifiedSinceVal >= lastModifiedVal; // operation will be performed only if it has _not_ been modified since the specified time
    const ifMatch =
      ifMatchVal !== undefined &&
      (ifMatchVal === ETagVal || ifMatchVal === "*");
    const ifNoneMatch =
      ifNoneMatchVal !== undefined && ifNoneMatchVal !== ETagVal;

    switch (usage) {
      case Usage.Read:
        if (
          (ifMatchVal !== undefined && !ifMatch) ||
          (ifUnmodifiedSinceVal !== undefined && !ifUnmodifiedSince)
        ) {
          throw new AzuriteError(ErrorCodes.ConditionNotMetWrite); // 412
        }

        if (
          (ifNoneMatchVal !== undefined && !ifNoneMatch) ||
          (ifModifiedSinceVal && !ifModifiedSince)
        ) {
          throw new AzuriteError(ErrorCodes.ConditionNotMetRead); // 304
        }
        break;
      case Usage.Write:
        if (
          (ifMatchVal !== undefined && !ifMatch) ||
          (ifUnmodifiedSinceVal !== undefined && !ifUnmodifiedSince) ||
          (ifNoneMatchVal !== undefined && !ifNoneMatch) ||
          (ifModifiedSinceVal !== undefined && !ifModifiedSince)
        ) {
          throw new AzuriteError(ErrorCodes.ConditionNotMetWrite); // 412
        }
        break;
    }
  }
}

export default new ConditionalRequestHeaders();
