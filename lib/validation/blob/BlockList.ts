const AError = from "./../../core/AzuriteError"),
  env = from "./../../core/env"),
  BlobExistsVal = from "./BlobExists"),
  ErrorCodes = from "./../../core/ErrorCodes");

class BlockList {
  /**
   * Checks whether the blocklist is correct. It is correct if all block ids are existant in the database.
   */
  public validate({ request = undefined, moduleOptions = undefined }) {
    const sm = moduleOptions.storageManager,
      blockList = request.payload;
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
        BlobExistsVal.validate({ blobProxy });
      } catch (e) {
        if (e.statusCode === 404) {
          throw new AError(ErrorCodes.InvalidBlockList);
        } else {
          throw e; // Something unexpected happened
        }
      }
    }
  }
}

export default new BlockList();
