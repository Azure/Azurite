const AError = from "./../../core/AzuriteError"),
  N = from "./../../core/HttpHeaderNames"),
  EntityType = from "./../../core/Constants").StorageEntityType,
  ErrorCodes = from "./../../core/ErrorCodes");

class PutBlobHeaders {
  public validate({ request = undefined }) {
    const length = request.httpProps[N.BLOB_CONTENT_LENGTH];
    if (request.entityType === EntityType.PageBlob) {
      if (length && (length < 0 || length % 512 != 0)) {
        throw new AError(ErrorCodes.InvalidHeaderValue);
      }
    } else {
      if (length) {
        throw new AError(ErrorCodes.UnsupportedHeader);
      }
    }
  }
}

export default new PutBlobHeaders();
