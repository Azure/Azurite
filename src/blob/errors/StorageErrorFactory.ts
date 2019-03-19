import StorageError from "./StorageError";

/**
 * A factory class maintains all Azure Storage Blob service errors.
 *
 * @export
 * @class StorageErrorFactory
 */
export default class StorageErrorFactory {
  public static getContainerNotFound(contextID: string): StorageError {
    return new StorageError(
      404,
      "ContainerNotFound",
      "The specified container does not exist.",
      contextID
    );
  }

  public static getContainerAlreadyExists(contextID: string): StorageError {
    return new StorageError(
      409,
      "ContainerAlreadyExists",
      "The specified container already exists.",
      contextID
    );
  }

  public static getBlobNotFound(contextID: string): StorageError {
    return new StorageError(
      404,
      "BlobNotFound",
      "The specified blob does not exist.",
      contextID
    );
  }

  public static getInvalidQueryParameterValue(contextID: string): StorageError {
    return new StorageError(
      400,
      "InvalidQueryParameterValue",
      `Value for one of the query parameters specified in the request URI is invalid.`,
      contextID
    );
  }

  public static getInvalidOperation(
    contextID: string,
    message: string = ""
  ): StorageError {
    return new StorageError(400, "InvalidOperation", message, contextID);
  }

  public static getInvalidPageRange(contextID: string): StorageError {
    return new StorageError(
      416,
      "Requested Range Not Satisfiable",
      "The page range specified is invalid.",
      contextID
    );
  }
}
