import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";

/*
 * Checks whether the blob has specific type.
 */
class IsOfBlobType {
  public validate(blobProxy, moduleOptions) {
    if (blobProxy.original.entityType !== moduleOptions.entityType) {
      throw new AzuriteError(ErrorCodes.InvalidBlobType);
    }
  }
}

export default new IsOfBlobType();
