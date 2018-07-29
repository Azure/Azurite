const AError = require("./../../core/AzuriteError"),
  ErrorCodes = require("./../../core/ErrorCodes");

class CompatibleBlobType {
  constructor() {}

  validate({ request = undefined, blobProxy = undefined }) {
    // skipped if blob is created, not updated
    if (blobProxy === undefined) {
      return;
    }
    if (request.entityType !== blobProxy.original.entityType) {
      throw new AError(ErrorCodes.InvalidBlobType);
    }
  }
}

export default new CompatibleBlobType();
