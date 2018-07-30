constimport AError from "./../../core/AzuriteError";
  ErrorCodes  from "./../../core/ErrorCodes");

/*
 * Checks whether the blob name adheres to the naming convention when being created within the $root container
 * as specified at https://docs.microsoft.com/en-us/rest/api/storageservices/working-with-the-root-container
 */
class BlobName {
  public validate({ request = undefined }) {
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
