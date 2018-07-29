const AError = require("./../../core/AzuriteError"),
  ErrorCodes = require("./../../core/ErrorCodes");

/*
 * Checks whether the blob name adheres to the naming convention when being created within the $root container
 * as specified at https://docs.microsoft.com/en-us/rest/api/storageservices/working-with-the-root-container
 */
class BlobName {
  constructor() {}

  validate({ request = undefined }) {
    const containerName = request.containerName,
      blobName = request.blobName;
    if (containerName === "$root") {
      if (blobName && blobName.includes("/")) {
        throw new AError(ErrorCodes.InvalidResourceName);
      }
    }
  }
}

export default new BlobName();
