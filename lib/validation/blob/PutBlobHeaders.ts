const AError = require("./../../core/AzuriteError"),
  N = require("./../../core/HttpHeaderNames"),
  EntityType = require("./../../core/Constants").StorageEntityType,
  ErrorCodes = require("./../../core/ErrorCodes");

class PutBlobHeaders {
  constructor() {}

  validate({ request = undefined }) {
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
