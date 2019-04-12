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

  public static getContainerInvalidLeaseDuration(
    contextID: string
  ): StorageError {
    return new StorageError(
      400,
      "InvalidLeaseDuration",
      "The LeaseDuration is invalid, it must between 15 and 60 seconds.",
      contextID
    );
  }

  public static getContainerLeaseAlreadyPresent(
    contextID: string
  ): StorageError {
    return new StorageError(
      409,
      "LeaseAlreadyPresent",
      "There is already a lease present.",
      contextID
    );
  }

  public static getContainerLeaseNotPresentWithLeaseOperation(
    contextID: string
  ): StorageError {
    return new StorageError(
      409,
      "LeaseNotPresentWithLeaseOperation",
      "There is currently no lease on the container.",
      contextID
    );
  }

  public static getContainerLeaseIdMismatchWithLeaseOperation(
    contextID: string
  ): StorageError {
    return new StorageError(
      409,
      "LeaseIdMismatchWithLeaseOperation",
      "The lease ID specified did not match the lease ID for the container.",
      contextID
    );
  }

  public static getContainerLeaseIsBrokenAndCannotBeRenewed(
    contextID: string
  ): StorageError {
    return new StorageError(
      409,
      "LeaseIsBrokenAndCannotBeRenewed",
      "The lease ID matched, but the lease has been broken explicitly and cannot be renewed.",
      contextID
    );
  }

  public static getContainerLeaseIsBreakingAndCannotBeChanged(
    contextID: string
  ): StorageError {
    return new StorageError(
      409,
      "LeaseIsBreakingAndCannotBeChanged",
      "The lease ID matched, but the lease is currently in breaking state and cannot be changed.",
      contextID
    );
  }

  public static getContainerLeaseIdMissing(contextID: string): StorageError {
    return new StorageError(
      412,
      "LeaseIdMissing",
      "There is currently a lease on the container and no lease ID was specified in the request.",
      contextID
    );
  }

  public static getContainerLeaseIdMismatchWithContainerOperation(
    contextID: string
  ): StorageError {
    return new StorageError(
      412,
      "LeaseIdMismatchWithContainerOperation",
      "The lease ID specified did not match the lease ID for the container.",
      contextID
    );
  }
}
