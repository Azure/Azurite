const AError = from "./../../core/AzuriteError"),
  ErrorCodes = from "./../../core/ErrorCodes"),
  EntityType = from "./../../core/Constants").StorageEntityType;

class SupportedBlobType {
  public validate({ request = undefined }) {
    if (
      request.entityType !== EntityType.AppendBlob &&
      request.entityType !== EntityType.BlockBlob &&
      request.entityType !== EntityType.PageBlob
    ) {
      throw new AError(ErrorCodes.UnsupportedBlobType);
    }
  }
}

export default new SupportedBlobType();
