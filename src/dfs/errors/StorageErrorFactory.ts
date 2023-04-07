import Context from "../generated/Context";
import DataLakeError from "./DataLakeError";

/**
 * A factory class maintains all Azure Storage Blob service errors.
 *
 * @export
 * @class DataLakeErrorFactory
 */
export default class DataLakeErrorFactory {
  public static getContainerNotFound(context: Context): DataLakeError {
    return new DataLakeError(
      404,
      "FilesystemNotFound",
      "The specified filesystem does not exist.",
      "ContainerNotFound",
      "The specified container does not exist.",
      context
    );
  }

  public static getRequestEntityTooLarge(context: Context): DataLakeError {
    return new DataLakeError(
      413,
      "RequestBodyTooLarge",
      "The request body is too large and exceeds the maximum permissible limit",
      "RequestEntityTooLarge",
      "The uploaded entity blob is too large.",
      context
    );
  }

  //TODO: check code/message for datalake
  public static getBlockCountExceedsLimit(context: Context): DataLakeError {
    return new DataLakeError(
      409,
      "BlockCountExceedsLimit",
      "The committed block count cannot exceed the maximum limit of 50,000 blocks.",
      "BlockCountExceedsLimit",
      "The committed block count cannot exceed the maximum limit of 50,000 blocks.",
      context
    );
  }

  public static getContainerAlreadyExists(context: Context): DataLakeError {
    return new DataLakeError(
      409,
      "FilesystemAlreadyExists",
      "he specified filesystem already exists.",
      "ContainerAlreadyExists",
      "The specified container already exists.",
      context
    );
  }

  public static getBlobAlreadyExists(context: Context): DataLakeError {
    return new DataLakeError(
      409,
      "PathAlreadyExists",
      "The specified path already exists.",
      "BlobAlreadyExists",
      "The specified blob already exists.",
      context
    );
  }

  public static getBlobNotFound(context: Context): DataLakeError {
    return new DataLakeError(
      404,
      "PathNotFound",
      "The specified path does not exist.",
      "BlobNotFound",
      "The specified blob does not exist.",
      context
    );
  }

  public static ResourceNotFound(context: Context): DataLakeError {
    return new DataLakeError(
      404,
      "ResourceNotFound",
      "The specified resource does not exist.",
      "ResourceNotFound",
      "The specified resource does not exist.",
      context
    );
  }

  public static getInvalidQueryParameterValue(
    context: Context,
    parameterName?: string,
    parameterValue?: string,
    reason?: string
  ): DataLakeError {
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

    return new DataLakeError(
      400,
      "InvalidQueryParameterValue",
      "Value for one of the query parameters specified in the request URI is invalid.",
      "InvalidQueryParameterValue",
      `Value for one of the query parameters specified in the request URI is invalid.`,
      context,
      additionalMessages
    );
  }

  public static getOutOfRangeInput(
    context: Context,
    parameterName?: string,
    parameterValue?: string,
    reason?: string
  ): DataLakeError {
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

    return new DataLakeError(
      400,
      "OutOfRangeInput",
      `One of the request inputs is out of range.`,
      "OutOfRangeInput",
      `One of the request inputs is out of range.`,
      context,
      additionalMessages
    );
  }

  //TODO: get the right code/message for datalake
  public static getInvalidOperation(
    context: Context,
    message: string = ""
  ): DataLakeError {
    return new DataLakeError(
      400,
      "InvalidOperation",
      message,
      "InvalidOperation",
      message,
      context
    );
  }

  //No Equivalent in DataLake
  public static getInvalidBlockList(context: Context): DataLakeError {
    return new DataLakeError(
      400,
      "InvalidBlockList",
      "The specified block list is invalid.",
      "InvalidBlockList",
      "The specified block list is invalid.",
      context
    );
  }

  public static getInvalidAuthenticationInfo(context: Context): DataLakeError {
    return new DataLakeError(
      400,
      "InvalidAuthenticationInfo",
      "Authentication information is not given in the correct format. Check the value of Authorization header.",
      "InvalidAuthenticationInfo",
      "Authentication information is not given in the correct format. Check the value of Authorization header.",
      context
    );
  }

  //TODO: check the right code/message for datalake
  public static getMd5Mismatch(
    context: Context,
    userSpecifiedMd5: string,
    serverCalculatedMd5: string
  ): DataLakeError {
    return new DataLakeError(
      400,
      "Md5Mismatch",
      "The MD5 value specified in the request did not match with the MD5 value calculated by the server.",
      "Md5Mismatch",
      "The MD5 value specified in the request did not match with the MD5 value calculated by the server.",
      context,
      {
        UserSpecifiedMd5: userSpecifiedMd5,
        ServerCalculatedMd5: serverCalculatedMd5
      }
    );
  }

  public static getInvalidPageRange(context: Context): DataLakeError {
    return new DataLakeError(
      416,
      "InvalidRange",
      "The page range specified is invalid.",
      "InvalidRange",
      "The page range specified is invalid.",
      context
    );
  }

  public static getInvalidLeaseDuration(context: Context): DataLakeError {
    return this.getInvalidHeaderValue(context);
  }

  public static getInvalidLeaseBreakPeriod(context: Context): DataLakeError {
    return this.getInvalidHeaderValue(context);
  }

  public static getInvalidId(context: Context): DataLakeError {
    return this.getInvalidHeaderValue(context);
  }

  //No equivalent in DataLake
  public static getInvalidBlobOrBlock(context: Context): DataLakeError {
    return new DataLakeError(
      400,
      "InvalidBlobOrBlock",
      "The specified blob or block content is invalid.",
      "InvalidBlobOrBlock",
      "The specified blob or block content is invalid.",
      context
    );
  }

  public static getLeaseAlreadyPresent(context: Context): DataLakeError {
    return new DataLakeError(
      409,
      "LeaseAlreadyPresent",
      "There is already a lease present.",
      "LeaseAlreadyPresent",
      "There is already a lease present.",
      context
    );
  }

  public static getLeaseIsBreakingAndCannotBeAcquired(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      409,
      "LeaseIsBreakingAndCannotBeAcquired",
      "The lease ID matched, but the lease is currently in breaking state and cannot be acquired until it is broken.",
      "LeaseIsBreakingAndCannotBeAcquired",
      "There is already a breaking lease, and can't  be acquired.",
      context
    );
  }

  public static getLeaseNotPresentWithLeaseOperation(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      409,
      "LeaseNotPresentWithLeaseOperation",
      "The lease ID is not present with the specified lease operation.",
      "LeaseNotPresentWithLeaseOperation",
      "There is currently no lease on the container or blob.",
      context
    );
  }

  public static getMissingRequestHeader(context: Context): DataLakeError {
    return new DataLakeError(
      400,
      "MissingRequiredHeader",
      "An HTTP header that's mandatory for this request is not specified.",
      "MissingRequiredHeader",
      "An HTTP header that's mandatory for this request is not specified.",
      context
    );
  }

  public static getLeaseIdMismatchWithLeaseOperation(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      409,
      "LeaseIdMismatchWithLeaseOperation",
      "The lease ID specified did not match the lease ID for the resource with the specified lease operation.",
      "LeaseIdMismatchWithLeaseOperation",
      "The lease ID specified did not match the lease ID for the container or blob.",
      context
    );
  }

  public static getLeaseIsBrokenAndCannotBeRenewed(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      409,
      "LeaseIsBrokenAndCannotBeRenewed",
      "The lease ID matched, but the lease has been broken explicitly and cannot be renewed.",
      "LeaseIsBrokenAndCannotBeRenewed",
      "The lease ID matched, but the lease has been broken explicitly and cannot be renewed.",
      context
    );
  }

  public static getLeaseIsBreakingAndCannotBeChanged(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      409,
      "LeaseIsBreakingAndCannotBeChanged",
      "The lease ID matched, but the lease is currently in breaking state and cannot be changed.",
      "LeaseIsBreakingAndCannotBeChanged",
      "The lease ID matched, but the lease is currently in breaking state and cannot be changed.",
      context
    );
  }

  public static getContainerLeaseIdMissing(context: Context): DataLakeError {
    return new DataLakeError(
      412,
      "LeaseIdMissing",
      "There is currently a lease on the resource and no lease ID was specified in the request.",
      "LeaseIdMissing",
      "There is currently a lease on the container and no lease ID was specified in the request.",
      context
    );
  }

  public static getContainerLeaseIdMismatchWithContainerOperation(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      412,
      "LeaseIdMismatchWithLeaseOperation",
      "The lease ID specified did not match the lease ID for the resource with the specified lease operation.",
      "LeaseIdMismatchWithContainerOperation",
      "The lease ID specified did not match the lease ID for the container.",
      context
    );
  }

  public static getContainerLeaseLost(context: Context): DataLakeError {
    return new DataLakeError(
      412,
      "LeaseNotPresentWithLeaseOperation",
      "The lease ID is not present with the specified lease operation.",
      "LeaseNotPresentWithContainerOperation",
      "A lease ID was specified, but the lease for the container has expired.",
      context
    );
  }

  public static getBlobLeaseIdMismatchWithLeaseOperation(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      409,
      "LeaseIdMismatchWithLeaseOperation",
      "The lease ID specified did not match the lease ID for the resource with the specified lease operation.",
      "LeaseIdMismatchWithLeaseOperation",
      "The lease ID specified did not match the lease ID for the blob.",
      context
    );
  }

  public static getBlobLeaseNotPresentWithLeaseOperation(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      409,
      "LeaseNotPresentWithLeaseOperation",
      "The lease ID is not present with the specified lease operation.",
      "LeaseNotPresentWithLeaseOperation",
      "There is currently no lease on the blob.",
      context
    );
  }

  // The error code/message need check with server
  public static getBlobSnapshotsPresent(context: Context): DataLakeError {
    return new DataLakeError(
      400,
      "SnapshotsPresent",
      "This operation is not permitted because the blob is snapshot.",
      "SnapshotsPresent",
      "This operation is not permitted because the blob is snapshot.",
      context
    );
  }

  public static getBlobLeaseIdMissing(context: Context): DataLakeError {
    return new DataLakeError(
      412,
      "LeaseIdMissing",
      "There is currently a lease on the resource and no lease ID was specified in the request.",
      "LeaseIdMissing",
      "There is currently a lease on the blob and no lease ID was specified in the request.",
      context
    );
  }

  public static getBlobLeaseIdMismatchWithBlobOperation(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      412,
      "LeaseIdMismatchWithLeaseOperation",
      "The lease ID specified did not match the lease ID for the resource with the specified lease operation.",
      "LeaseIdMismatchWithBlobOperation",
      "The lease ID specified did not match the lease ID for the blob.",
      context
    );
  }

  public static getBlobLeaseLost(context: Context): DataLakeError {
    return new DataLakeError(
      412,
      "LeaseNotPresentWithLeaseOperation",
      "The lease ID is not present with the specified lease operation.",
      "LeaseNotPresentWithBlobOperation",
      "A lease ID was specified, but the lease for the blob has expired.",
      context
    );
  }

  public static getAuthorizationFailure(context: Context): DataLakeError {
    return new DataLakeError(
      403,
      "AuthorizationFailure",
      "Server failed to authenticate the request. Make sure the value of the Authorization header is formed correctly including the signature.",
      "AuthorizationFailure",
      // tslint:disable-next-line:max-line-length
      "Server failed to authenticate the request. Make sure the value of the Authorization header is formed correctly including the signature.",
      context
    );
  }

  public static getAuthenticationFailed(
    context: Context,
    authenticationErrorDetail: string
  ): DataLakeError {
    return new DataLakeError(
      403,
      "AuthorizationFailure",
      "Server failed to authenticate the request. Make sure the value of the Authorization header is formed correctly including the signature.",
      "AuthenticationFailed",
      "Server failed to authenticate the request. Make sure the value of the Authorization header is formed correctly including the signature.",
      context,
      {
        AuthenticationErrorDetail: authenticationErrorDetail
      }
    );
  }

  public static getBlobInvalidBlobType(context: Context): DataLakeError {
    return new DataLakeError(
      409,
      "InvalidBlobType",
      "The blob type is invalid for this operation.",
      "InvalidBlobType",
      "The blob type is invalid for this operation.",
      context
    );
  }

  public static getAccessTierNotSupportedForBlobType(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      400,
      "AccessTierNotSupportedForBlobType",
      "The access tier is not supported for this blob type.",
      "AccessTierNotSupportedForBlobType",
      "The access tier is not supported for this blob type.",
      context
    );
  }

  public static getMultipleConditionHeadersNotSupported(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      400,
      "MultipleConditionHeadersNotSupported",
      "Multiple condition headers are not supported.",
      "MultipleConditionHeadersNotSupported",
      "Multiple condition headers are not supported.",
      context
    );
  }

  public static getBlobSnapshotsPresent_hassnapshot(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      409,
      "SnapshotsPresent",
      "This operation is not permitted because the blob has snapshots.",
      "SnapshotsPresent",
      "This operation is not permitted because the blob has snapshots.",
      context
    );
  }

  public static getBlobCannotChangeToLowerTier(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      409,
      "CannotChangeToLowerTier",
      "A higher blob tier has already been explicitly set.",
      "CannotChangeToLowerTier",
      "A higher blob tier has already been explicitly set.",
      context
    );
  }

  public static getBlobBlobTierInadequateForContentLength(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      409,
      "BlobTierInadequateForContentLength",
      "Specified blob tier size limit cannot be less than content length.",
      "BlobTierInadequateForContentLength",
      "Specified blob tier size limit cannot be less than content length.",
      context
    );
  }

  public static getAuthorizationSourceIPMismatch(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      403,
      "AuthorizationSourceIPMismatch",
      "This request is not authorized to perform this operation using this source IP {SourceIP}.",
      "AuthorizationSourceIPMismatch",
      "This request is not authorized to perform this operation using this source IP {SourceIP}.",
      context
    );
  }

  public static getAuthorizationProtocolMismatch(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      403,
      "AuthorizationProtocolMismatch",
      "This request is not authorized to perform this operation using this protocol.",
      "AuthorizationProtocolMismatch",
      "This request is not authorized to perform this operation using this protocol.",
      context
    );
  }

  public static getAuthorizationPermissionMismatch(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      403,
      "AuthorizationPermissionMismatch",
      "This request is not authorized to perform this operation using this permission.",
      "AuthorizationPermissionMismatch",
      "This request is not authorized to perform this operation using this permission.",
      context
    );
  }

  public static getAuthorizationServiceMismatch(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      403,
      "AuthorizationServiceMismatch",
      "This request is not authorized to perform this operation using this service.",
      "AuthorizationServiceMismatch",
      "This request is not authorized to perform this operation using this service.",
      context
    );
  }

  public static getAuthorizationResourceTypeMismatch(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      403,
      "AuthorizationResourceTypeMismatch",
      "This request is not authorized to perform this operation using this resource type.",
      "AuthorizationResourceTypeMismatch",
      "This request is not authorized to perform this operation using this resource type.",
      context
    );
  }

  public static getFeatureVersionMismatch(context: Context): DataLakeError {
    return new DataLakeError(
      409,
      "FeatureVersionMismatch",
      "Stored access policy contains a permission that is not supported by this version.",
      "FeatureVersionMismatch",
      "Stored access policy contains a permission that is not supported by this version.",
      context
    );
  }

  public static getCopyIdMismatch(context: Context): DataLakeError {
    return new DataLakeError(
      409,
      "CopyIdMismatch",
      "The specified copy ID did not match the copy ID for the pending copy operation.",
      "CopyIdMismatch",
      "The specified copy ID did not match the copy ID for the pending copy operation.",
      context
    );
  }

  public static getNoPendingCopyOperation(context: Context): DataLakeError {
    return new DataLakeError(
      409,
      "NoPendingCopyOperation",
      "There is currently no pending copy operation.",
      "NoPendingCopyOperation",
      "There is currently no pending copy operation.",
      context
    );
  }

  public static getSnapshotsPresent(context: Context): DataLakeError {
    return new DataLakeError(
      409,
      "SnapshotsPresent",
      "This operation is not permitted while the blob has snapshots.",
      "SnapshotsPresent",
      "This operation is not permitted while the blob has snapshots.",
      context
    );
  }

  public static getConditionNotMet(context: Context): DataLakeError {
    return new DataLakeError(
      412,
      "ConditionNotMet",
      "The condition specified using HTTP conditional header(s) is not met.",
      "ConditionNotMet",
      "The condition specified using HTTP conditional header(s) is not met.",
      context
    );
  }

  public static getMaxBlobSizeConditionNotMet(context: Context): DataLakeError {
    return new DataLakeError(
      412,
      "MaxBlobSizeConditionNotMet",
      "The max blob size condition specified was not met.",
      "MaxBlobSizeConditionNotMet",
      "The max blob size condition specified was not met.",
      context
    );
  }

  public static getAppendPositionConditionNotMet(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      412,
      "AppendPositionConditionNotMet",
      "The append position condition specified was not met.",
      "AppendPositionConditionNotMet",
      "The append position condition specified was not met.",
      context
    );
  }

  public static getSequenceNumberConditionNotMet(
    context: Context
  ): DataLakeError {
    return new DataLakeError(
      412,
      "SequenceNumberConditionNotMet",
      "The condition specified using HTTP conditional header(s) is not met.",
      "SequenceNumberConditionNotMet",
      "The condition specified using HTTP conditional header(s) is not met.",
      context
    );
  }

  public static getNotModified(context: Context): DataLakeError {
    return new DataLakeError(
      304,
      "ConditionNotMet",
      "The condition specified using HTTP conditional header(s) is not met.",
      "ConditionNotMet",
      "The condition specified using HTTP conditional header(s) is not met.",
      context
    );
  }

  public static getUnsatisfiableCondition(context: Context): DataLakeError {
    return new DataLakeError(
      400,
      "UnsatisfiableCondition",
      "The request includes an unsatisfiable condition for this operation.",
      "UnsatisfiableCondition",
      "The request includes an unsatisfiable condition for this operation.",
      context
    );
  }

  public static getInvalidHeaderValue(
    context: Context,
    additionalMessages?: { [key: string]: string }
  ): DataLakeError {
    if (additionalMessages === undefined) {
      additionalMessages = {};
    }
    return new DataLakeError(
      400,
      "InvalidHeaderValue",
      "The value for one of the HTTP headers is not in the correct format.",
      "InvalidHeaderValue",
      "The value for one of the HTTP headers is not in the correct format.",
      context,
      additionalMessages
    );
  }

  public static getInvalidAPIVersion(
    context: Context,
    apiVersion?: string
  ): DataLakeError {
    return new DataLakeError(
      400,
      "InvalidHeaderValue",
      `The API version ${apiVersion} is not supported by Azurite. Please upgrade Azurite to latest version and retry. If you are using Azurite in Visual Studio, please check you have installed latest Visual Studio patch. Azurite command line parameter \"--skipApiVersionCheck\" or Visual Studio Code configuration \"Skip Api Version Check\" can skip this error. `,
      "InvalidHeaderValue",
      `The API version ${apiVersion} is not supported by Azurite. Please upgrade Azurite to latest version and retry. If you are using Azurite in Visual Studio, please check you have installed latest Visual Studio patch. Azurite command line parameter \"--skipApiVersionCheck\" or Visual Studio Code configuration \"Skip Api Version Check\" can skip this error. `,
      context
    );
  }

  public static getBlobArchived(
    context: Context,
    additionalMessages?: { [key: string]: string }
  ): DataLakeError {
    if (additionalMessages === undefined) {
      additionalMessages = {};
    }
    return new DataLakeError(
      409,
      "BlobArchived",
      "This operation is not permitted on an archived blob.",
      "BlobArchived",
      "This operation is not permitted on an archived blob.",
      context,
      additionalMessages
    );
  }

  public static getInvalidCorsHeaderValue(
    context: Context,
    additionalMessages?: { [key: string]: string }
  ): DataLakeError {
    return new DataLakeError(
      400,
      "InvalidHeaderValue",
      "A required CORS header is not present.",
      "InvalidHeaderValue",
      "A required CORS header is not present.",
      context,
      additionalMessages
    );
  }

  public static corsPreflightFailure(
    context: Context,
    additionalMessages?: { [key: string]: string }
  ): DataLakeError {
    return new DataLakeError(
      403,
      "CorsPreflightFailure",
      "CORS not enabled or no matching rule found for this request.",
      "CorsPreflightFailure",
      "CORS not enabled or no matching rule found for this request.",
      context,
      additionalMessages
    );
  }

  public static getCannotVerifyCopySource(
    context: Context,
    statusCode: number,
    message: string,
    additionalMessages?: { [key: string]: string }
  ): DataLakeError {
    return new DataLakeError(
      statusCode,
      "CannotVerifyCopySource",
      message,
      "CannotVerifyCopySource",
      message,
      context,
      additionalMessages
    );
  }

  public static getInvalidResourceName(context: Context): DataLakeError {
    return new DataLakeError(
      400,
      "InvalidResourceName",
      "The specified resource name contains invalid characters.",
      "InvalidResourceName",
      "The specified resource name contains invalid characters.",
      context
    );
  }

  public static getOutOfRangeName(context: Context): DataLakeError {
    return new DataLakeError(
      400,
      "OutOfRangeInput",
      "One of the request inputs is out of range.",
      "OutOfRangeInput",
      `The specified resource name length is not within the permissible limits.`,
      context
    );
  }

  public static getUnexpectedSyncCopyStatus(
    context: Context,
    copyStatus: string
  ): DataLakeError {
    return new DataLakeError(
      409,
      "UnexpectedSyncCopyStatus",
      'Expected copyStatus to be "success" but got different status.',
      "UnexpectedSyncCopyStatus",
      'Expected copyStatus to be "success" but got different status.',
      context,
      { ReceivedCopyStatus: copyStatus }
    );
  }

  public static getInvalidInput(
    context: Context,
    message: string
  ): DataLakeError {
    return new DataLakeError(
      400,
      "InvalidInput",
      message,
      "InvalidInput",
      message,
      context
    );
  }

  public static getPathConflict(context: Context) {
    return new DataLakeError(
      409,
      "PathConflict",
      "The specified path, or an element of the path, exists and its resource type is invalid for this operation.",
      "PathConflict",
      "The specified path, or an element of the path, exists and its resource type is invalid for this operation.",
      context
    );
  }
}
