import StorageError from "./StorageError";

const DefaultID: string = "DefaultBlobRequestID";

/**
 * A factory class maintains all Azure Storage Blob service errors.
 *
 * @export
 * @class StorageErrorFactory
 */
export default class StorageErrorFactory {
  public static getContainerNotFound(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      404,
      "ContainerNotFound",
      "The specified container does not exist.",
      contextID
    );
  }

  public static getRequestEntityTooLarge(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      413,
      "RequestEntityTooLarge",
      "The uploaded entity blob is too large.",
      contextID
    );
  }

  public static getBlockCountExceedsLimit(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      409,
      "BlockCountExceedsLimit",
      "The committed block count cannot exceed the maximum limit of 50,000 blocks.",
      contextID
    );
  }

  public static getContainerAlreadyExists(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      409,
      "ContainerAlreadyExists",
      "The specified container already exists.",
      contextID
    );
  }

  public static getBlobAlreadyExists(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      409,
      "BlobAlreadyExists",
      "The specified blob already exists.",
      contextID
    );
  }

  public static getBlobNotFound(contextID: string = DefaultID): StorageError {
    return new StorageError(
      404,
      "BlobNotFound",
      "The specified blob does not exist.",
      contextID
    );
  }

  public static ResourceNotFound(contextID: string = DefaultID): StorageError {
    return new StorageError(
      404,
      "ResourceNotFound",
      "The specified resource does not exist.",
      contextID
    );
  }

  public static getInvalidQueryParameterValue(
    contextID: string = DefaultID,
    parameterName?: string,
    parameterValue?: string,
    reason?: string
  ): StorageError {
    const additionalMessages: {
      [key: string]: string;
    } = {};

    if (parameterName) {
      additionalMessages.QueryParameterName = parameterName;
    }

    if (parameterValue) {
      additionalMessages.QueryParameterValue = parameterValue;
    }

    if (reason) {
      additionalMessages.Reason = reason;
    }

    return new StorageError(
      400,
      "InvalidQueryParameterValue",
      `Value for one of the query parameters specified in the request URI is invalid.`,
      contextID,
      additionalMessages
    );
  }

  public static getOutOfRangeInput(
    contextID: string = DefaultID,
    parameterName?: string,
    parameterValue?: string,
    reason?: string
  ): StorageError {
    const additionalMessages: {
      [key: string]: string;
    } = {};

    if (parameterName) {
      additionalMessages.QueryParameterName = parameterName;
    }

    if (parameterValue) {
      additionalMessages.QueryParameterValue = parameterValue;
    }

    if (reason) {
      additionalMessages.Reason = reason;
    }

    return new StorageError(
      400,
      "OutOfRangeInput",
      `One of the request inputs is out of range.`,
      contextID,
      additionalMessages
    );
  }

  public static getInvalidOperation(
    contextID: string = DefaultID,
    message: string = ""
  ): StorageError {
    return new StorageError(400, "InvalidOperation", message, contextID);
  }

  public static getInvalidBlockList(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      400,
      "InvalidBlockList",
      "The specified block list is invalid.",
      contextID
    );
  }

  public static getInvalidAuthenticationInfo(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      400,
      "InvalidAuthenticationInfo",
      "Authentication information is not given in the correct format. Check the value of Authorization header.",
      contextID
    );
  }

  public static getMd5Mismatch(
    contextID: string = DefaultID,
    userSpecifiedMd5: string,
    serverCalculatedMd5: string
  ): StorageError {
    return new StorageError(
      400,
      "Md5Mismatch",
      "The MD5 value specified in the request did not match with the MD5 value calculated by the server.",
      contextID,
      {
        UserSpecifiedMd5: userSpecifiedMd5,
        ServerCalculatedMd5: serverCalculatedMd5
      }
    );
  }

  public static getInvalidPageRange(contextID: string): StorageError {
    return new StorageError(
      416,
      "Requested Range Not Satisfiable",
      "The page range specified is invalid.",
      contextID
    );
  }

  public static getInvalidPageRange2(contextID: string, contentRange?: string): StorageError {
    let returnValue = new StorageError(
      416,
      "InvalidRange",
      "The range specified is invalid for the current size of the resource.",
      contextID
    );
    if (contentRange) {
      returnValue.headers!["Content-Range"] = contentRange;
    }
    return returnValue;
  }

  public static getInvalidLeaseDuration(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      400,
      "InvalidHeaderValue",
      "The value for one of the HTTP headers is not in the correct format.",
      contextID
    );
  }

  public static getInvalidLeaseBreakPeriod(
    contextID: string = DefaultID
  ): StorageError {
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

  public static getInvalidBlobOrBlock(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      400,
      "InvalidBlobOrBlock",
      "The specified blob or block content is invalid.",
      contextID
    );
  }

  public static getLeaseAlreadyPresent(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      409,
      "LeaseAlreadyPresent",
      "There is already a lease present.",
      contextID
    );
  }

  public static getLeaseIsBreakingAndCannotBeAcquired(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      409,
      "LeaseIsBreakingAndCannotBeAcquired",
      "There is already a breaking lease, and can't  be acquired.",
      contextID
    );
  }

  public static getLeaseNotPresentWithLeaseOperation(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      409,
      "LeaseNotPresentWithLeaseOperation",
      "There is currently no lease on the container or blob.",
      contextID
    );
  }

  public static getLeaseIdMismatchWithLeaseOperation(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      409,
      "LeaseIdMismatchWithLeaseOperation",
      "The lease ID specified did not match the lease ID for the container or blob.",
      contextID
    );
  }

  public static getLeaseIsBrokenAndCannotBeRenewed(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      409,
      "LeaseIsBrokenAndCannotBeRenewed",
      "The lease ID matched, but the lease has been broken explicitly and cannot be renewed.",
      contextID
    );
  }

  public static getLeaseIsBreakingAndCannotBeChanged(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      409,
      "LeaseIsBreakingAndCannotBeChanged",
      "The lease ID matched, but the lease is currently in breaking state and cannot be changed.",
      contextID
    );
  }

  public static getContainerLeaseIdMissing(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      412,
      "LeaseIdMissing",
      "There is currently a lease on the container and no lease ID was specified in the request.",
      contextID
    );
  }

  public static getContainerLeaseIdMismatchWithContainerOperation(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      412,
      "LeaseIdMismatchWithContainerOperation",
      "The lease ID specified did not match the lease ID for the container.",
      contextID
    );
  }

  public static getContainerLeaseLost(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      412,
      "LeaseNotPresentWithContainerOperation",
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
  public static getBlobSnapshotsPresent(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      400,
      "SnapshotsPresent",
      "This operation is not permitted because the blob is snapshot.",
      contextID
    );
  }

  public static getBlobLeaseIdMissing(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      412,
      "LeaseIdMissing",
      "There is currently a lease on the blob and no lease ID was specified in the request.",
      contextID
    );
  }

  public static getBlobLeaseIdMismatchWithBlobOperation(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      412,
      "LeaseIdMismatchWithBlobOperation",
      "The lease ID specified did not match the lease ID for the blob.",
      contextID
    );
  }

  public static getBlobLeaseLost(contextID: string = DefaultID): StorageError {
    return new StorageError(
      412,
      "LeaseNotPresentWithBlobOperation",
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

  public static getAuthenticationFailed(
    contextID: string = DefaultID,
    authenticationErrorDetail: string
  ): StorageError {
    return new StorageError(
      403,
      "AuthenticationFailed",
      "Server failed to authenticate the request. Make sure the value of the Authorization header is formed correctly including the signature.",
      contextID,
      {
        AuthenticationErrorDetail: authenticationErrorDetail
      }
    );
  }

  public static getBlobInvalidBlobType(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      409,
      "InvalidBlobType",
      "The blob type is invalid for this operation.",
      contextID
    );
  }

  public static getAccessTierNotSupportedForBlobType(
    contextID: string
  ): StorageError {
    return new StorageError(
      400,
      "AccessTierNotSupportedForBlobType",
      "The access tier is not supported for this blob type.",
      contextID
    );
  }

  public static getMultipleConditionHeadersNotSupported(
    contextID: string
  ): StorageError {
    return new StorageError(
      400,
      "MultipleConditionHeadersNotSupported",
      "Multiple condition headers are not supported.",
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

  public static getBothUserTagsAndSourceTagsCopyPresentException(contextID: string): StorageError {
    return new StorageError(
      400,
      "BothUserTagsAndSourceTagsCopyPresentException",
      "x-ms-tags header must not be present with x-ms-copy-source-tag-option as COPY.",
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

  public static getConditionNotMet(contextID: string): StorageError {
    return new StorageError(
      412,
      "ConditionNotMet",
      "The condition specified using HTTP conditional header(s) is not met.",
      contextID
    );
  }

  public static getMaxBlobSizeConditionNotMet(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      412,
      "MaxBlobSizeConditionNotMet",
      "The max blob size condition specified was not met.",
      contextID
    );
  }

  public static getAppendPositionConditionNotMet(
    contextID: string = DefaultID
  ): StorageError {
    return new StorageError(
      412,
      "AppendPositionConditionNotMet",
      "The append position condition specified was not met.",
      contextID
    );
  }

  public static getSequenceNumberConditionNotMet(
    contextID: string
  ): StorageError {
    return new StorageError(
      412,
      "SequenceNumberConditionNotMet",
      "The condition specified using HTTP conditional header(s) is not met.",
      contextID
    );
  }

  public static getNotModified(contextID: string): StorageError {
    return new StorageError(
      304,
      "ConditionNotMet",
      "The condition specified using HTTP conditional header(s) is not met.",
      contextID
    );
  }

  public static getUnsatisfiableCondition(contextID: string): StorageError {
    return new StorageError(
      400,
      "UnsatisfiableCondition",
      "The request includes an unsatisfiable condition for this operation.",
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

  public static getInvalidAPIVersion(
    contextID: string = "",
    apiVersion?: string,
  ): StorageError {
    return new StorageError(
      400,
      "InvalidHeaderValue",
      `The API version ${apiVersion} is not supported by Azurite. Please upgrade Azurite to latest version and retry. If you are using Azurite in Visual Studio, please check you have installed latest Visual Studio patch. Azurite command line parameter \"--skipApiVersionCheck\" or Visual Studio Code configuration \"Skip Api Version Check\" can skip this error. `,
      contextID
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

  public static getInvalidCorsHeaderValue(
    contextID: string = "",
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    return new StorageError(
      400,
      "InvalidHeaderValue",
      "A required CORS header is not present.",
      contextID,
      additionalMessages
    );
  }

  public static corsPreflightFailure(
    contextID: string = "",
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    return new StorageError(
      403,
      "CorsPreflightFailure",
      "CORS not enabled or no matching rule found for this request.",
      contextID,
      additionalMessages
    );
  }

  public static getCannotVerifyCopySource(
    contextID: string,
    statusCode: number,
    message: string,
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    return new StorageError(
      statusCode,
      "CannotVerifyCopySource",
      message,
      contextID,
      additionalMessages
    );
  }

  public static getInvalidResourceName(contextID: string = ""): StorageError {
    return new StorageError(
      400,
      "InvalidResourceName",
      `The specified resource name contains invalid characters.`,
      contextID
    );
  }

  public static getOutOfRangeName(contextID: string = ""): StorageError {
    return new StorageError(
      400,
      "OutOfRangeInput",
      `The specified resource name length is not within the permissible limits.`,
      contextID
    );
  }

  public static getUnexpectedSyncCopyStatus(
    contextID: string,
    copyStatus: string
  ): StorageError {
    return new StorageError(
      409,
      "UnexpectedSyncCopyStatus",
      'Expected copyStatus to be "success" but got different status.',
      contextID,
      { ReceivedCopyStatus: copyStatus }
    );
  }

  public static getInvalidMetadata(contextID: string): StorageError {
    return new StorageError(
      400,
      "InvalidMetadata",
      "The metadata specified is invalid. It has characters that are not permitted.",
      contextID
    );
  }

  public static getEmptyTagName(contextID: string): StorageError {
    return new StorageError(
      400,
      "EmptyTagName",
      "The name of one of the tag key-value pairs is empty.",
      contextID
    );
  }

  public static getDuplicateTagNames(contextID: string): StorageError {
    return new StorageError(
      400,
      "DuplicateTagNames",
      "The tags specified contain duplicate names.",
      contextID
    );
  }

  public static getTagsTooLarge(contextID: string): StorageError {
    return new StorageError(
      400,
      "TagsTooLarge",
      "The tags specified exceed the maximum permissible limit.",
      contextID
    );
  }

  public static getInvalidTag(contextID: string): StorageError {
    return new StorageError(
      400,
      "DuplicateTagNames",
      "The tags specified are invalid. It contains characters that are not permitted.",
      contextID
    );
  }

  public static getInvalidXmlDocument(
    contextID: string = ""
  ): StorageError {
    return new StorageError(
      400,
      "InvalidXmlDocument",
      `XML specified is not syntactically valid.`,
      contextID
    );
  }

  public static getBlobSealed(
    contextID: string = ""
  ): StorageError {
    return new StorageError(
      409,
      "BlobIsSealed",
      "The specified blob is sealed, and its contents can't be modified unless the blob is re-created after a delete.",
      contextID
    );
  }
}
