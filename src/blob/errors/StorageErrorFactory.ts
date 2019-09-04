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

  public static getInvalidLeaseDuration(contextID: string): StorageError {
    return new StorageError(
      400,
      "InvalidHeaderValue",
      "The value for one of the HTTP headers is not in the correct format.",
      contextID
    );
  }

  public static getInvalidLeaseBreakPeriod(contextID: string): StorageError {
    return new StorageError(
      400,
      "InvalidHeaderValue",
      "The value for one of the HTTP headers is not in the correct format.",
      contextID
    );
  }

  public static getInvalidId(contextID: string): StorageError {
    return new StorageError(
      400,
      "InvalidHeaderValue",
      "The value for one of the HTTP headers is not in the correct format.",
      contextID
    );
  }

  public static getLeaseAlreadyPresent(contextID: string): StorageError {
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

  public static getLeaseIsBrokenAndCannotBeRenewed(
    contextID: string
  ): StorageError {
    return new StorageError(
      409,
      "LeaseIsBrokenAndCannotBeRenewed",
      "The lease ID matched, but the lease has been broken explicitly and cannot be renewed.",
      contextID
    );
  }

  public static getLeaseIsBreakingAndCannotBeChanged(
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

  public static getContainerLeaseLost(contextID: string): StorageError {
    return new StorageError(
      412,
      "LeaseLost",
      "A lease ID was specified, but the lease for the container has expired.",
      contextID
    );
  }

  public static getBlobLeaseIdMismatchWithLeaseOperation(
    contextID: string
  ): StorageError {
    return new StorageError(
      409,
      "LeaseIdMismatchWithLeaseOperation",
      "The lease ID specified did not match the lease ID for the blob.",
      contextID
    );
  }

  public static getBlobLeaseNotPresentWithLeaseOperation(
    contextID: string
  ): StorageError {
    return new StorageError(
      409,
      "LeaseNotPresentWithLeaseOperation",
      "There is currently no lease on the blob.",
      contextID
    );
  }

  // The error code/message need check with server
  public static getBlobSnapshotsPresent(contextID: string): StorageError {
    return new StorageError(
      400,
      "SnapshotsPresent",
      "This operation is not permitted because the blob is snapshot.",
      contextID
    );
  }

  public static getBlobLeaseIdMissing(contextID: string): StorageError {
    return new StorageError(
      412,
      "LeaseIdMissing",
      "There is currently a lease on the blob and no lease ID was specified in the request.",
      contextID
    );
  }

  public static getBlobLeaseIdMismatchWithBlobOperation(
    contextID: string
  ): StorageError {
    return new StorageError(
      412,
      "LeaseIdMismatchWithBlobOperation ",
      "The lease ID specified did not match the lease ID for the blob.",
      contextID
    );
  }

  public static getBlobLeaseLost(contextID: string): StorageError {
    return new StorageError(
      412,
      "LeaseLost ",
      "A lease ID was specified, but the lease for the blob has expired.",
      contextID
    );
  }

  public static getAuthorizationFailure(contextID: string): StorageError {
    return new StorageError(
      403,
      "AuthorizationFailure",
      // tslint:disable-next-line:max-line-length
      "Server failed to authenticate the request. Make sure the value of the Authorization header is formed correctly including the signature.",
      contextID
    );
  }

  public static getBlobInvalidBlobType(contextID: string): StorageError {
    return new StorageError(
      409,
      "InvalidBlobType",
      "The blob type is invalid for this operation.",
      contextID
    );
  }

  public static getBlobSnapshotsPresent_hassnapshot(
    contextID: string
  ): StorageError {
    return new StorageError(
      409,
      "SnapshotsPresent",
      "This operation is not permitted because the blob has snapshots.",
      contextID
    );
  }

  public static getBlobCannotChangeToLowerTier(
    contextID: string
  ): StorageError {
    return new StorageError(
      409,
      "CannotChangeToLowerTier",
      "A higher blob tier has already been explicitly set.",
      contextID
    );
  }

  public static getBlobBlobTierInadequateForContentLength(
    contextID: string
  ): StorageError {
    return new StorageError(
      409,
      "BlobTierInadequateForContentLength",
      "Specified blob tier size limit cannot be less than content length.",
      contextID
    );
  }

  public static getAuthorizationSourceIPMismatch(
    contextID: string
  ): StorageError {
    return new StorageError(
      403,
      "AuthorizationSourceIPMismatch",
      "This request is not authorized to perform this operation using this source IP {SourceIP}.",
      contextID
    );
  }

  public static getAuthorizationProtocolMismatch(
    contextID: string
  ): StorageError {
    return new StorageError(
      403,
      "AuthorizationProtocolMismatch",
      "This request is not authorized to perform this operation using this protocol.",
      contextID
    );
  }

  public static getAuthorizationPermissionMismatch(
    contextID: string
  ): StorageError {
    return new StorageError(
      403,
      "AuthorizationPermissionMismatch",
      "This request is not authorized to perform this operation using this permission.",
      contextID
    );
  }

  public static getAuthorizationServiceMismatch(
    contextID: string
  ): StorageError {
    return new StorageError(
      403,
      "AuthorizationServiceMismatch",
      "This request is not authorized to perform this operation using this service.",
      contextID
    );
  }

  public static getAuthorizationResourceTypeMismatch(
    contextID: string
  ): StorageError {
    return new StorageError(
      403,
      "AuthorizationResourceTypeMismatch",
      "This request is not authorized to perform this operation using this resource type.",
      contextID
    );
  }

  public static getFeatureVersionMismatch(contextID: string): StorageError {
    return new StorageError(
      409,
      "FeatureVersionMismatch",
      "Stored access policy contains a permission that is not supported by this version.",
      contextID
    );
  }

  public static getCopyIdMismatch(contextID: string): StorageError {
    return new StorageError(
      409,
      "CopyIdMismatch",
      "The specified copy ID did not match the copy ID for the pending copy operation.",
      contextID
    );
  }

  public static getNoPendingCopyOperation(contextID: string): StorageError {
    return new StorageError(
      409,
      "NoPendingCopyOperation",
      "There is currently no pending copy operation.",
      contextID
    );
  }

  public static getSnapshotsPresent(contextID: string): StorageError {
    return new StorageError(
      409,
      "SnapshotsPresent",
      "This operation is not permitted while the blob has snapshots.",
      contextID
    );
  }

  public static getInvalidHeaderValue(
    contextID: string = "",
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    if (additionalMessages === undefined) {
      additionalMessages = {};
    }
    return new StorageError(
      400,
      "InvalidHeaderValue",
      "The value for one of the HTTP headers is not in the correct format.",
      contextID,
      additionalMessages
    );
  }

  public static getBlobArchived(
    contextID: string = "",
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    if (additionalMessages === undefined) {
      additionalMessages = {};
    }
    return new StorageError(
      409,
      "BlobArchived",
      "This operation is not permitted on an archived blob.",
      contextID,
      additionalMessages
    );
  }
}
