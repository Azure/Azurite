import AzuriteError from "../../core/AzuriteError";
import env from "../../core/env";
import ErrorCodes from "../../core/ErrorCodes";
import BlobExists from "./BlobExists";

class BlockList {
  /**
   * Checks whether the blocklist is correct. It is correct if all block ids are existant in the database.
   */
  public validate(request, moduleOptions) {
    const sm = moduleOptions.storageManager;
    const blockList = request.payload;
    for (const block of blockList) {
      const blobId = env.blockId(
        request.containerName,
        request.blobName,
        block.id
      );
      const { blobProxy } = sm._getCollectionAndBlob(
        request.containerName,
        blobId
      );
      try {
        BlobExists.validate({ blobProxy });
      } catch (e) {
        if (e.statusCode === 404) {
          throw new AzuriteError(ErrorCodes.InvalidBlockList);
        } else {
          throw e; // Something unexpected happened
        }
      }
    }
  }
}

export default new BlockList();
