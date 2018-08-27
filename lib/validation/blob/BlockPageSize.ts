import AzuriteError from "../../core/AzuriteError";
import { StorageEntityType } from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";
import N from "./../../core/HttpHeaderNames";

/**
 * Validates whether PUT Block, PUT AppendBlob, and PUT Page operations adhere
 * to allowed maximum size.
 *
 * @class BlockPageSize
 */
class BlockPageSize {
  public validate(request) {
    const size = request.body.length || request.httpProps[N.CONTENT_LENGTH];
    switch (request.entityType) {
      case StorageEntityType.BlockBlob:
        // Blocks larger than 100MB are not allowed since API version 2016-05-31
        // see https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/put-block
        if (size > 104857600) {
          throw new AzuriteError(ErrorCodes.RequestBodyTooLarge);
        }
        break;
      case StorageEntityType.AppendBlob:
        // ApppendBlocks larger than 4MB are not allowed as per specification at
        // see https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/append-block
        if (size > 4194304) {
          throw new AzuriteError(ErrorCodes.RequestBodyTooLarge);
        }
        break;
      case StorageEntityType.PageBlob:
        // Pages larger than 4MB are not allowed as per specification at
        // https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/put-page
        if (size > 4194304) {
          throw new AzuriteError(ErrorCodes.RequestBodyTooLarge);
        }
        break;
      default:
        throw new AzuriteError(ErrorCodes.InvalidBlobType);
    }
  }
}

export default new BlockPageSize();
