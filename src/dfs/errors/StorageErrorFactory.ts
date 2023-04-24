import Context from "../../blob/generated/Context";
import DataLakeError from "./DataLakeError";

const codeMap: Map<string, string> = new Map<string, string>();
const errorMsgMap: Map<string, string> = new Map<string, string>();

codeMap.set("ContainerNotFound", "FilesystemNotFound");
codeMap.set("RequestEntityTooLarge", "RequestBodyTooLarge");
codeMap.set("ContainerAlreadyExists", "FilesystemAlreadyExists");
codeMap.set("BlobAlreadyExists", "PathAlreadyExists");
codeMap.set("BlobNotFound", "PathNotFound");
codeMap.set("LeaseIdMismatchWithContainerOperation", "LeaseIdMismatchWithLeaseOperation");
codeMap.set("LeaseIdMismatchWithBlobOperation", "LeaseIdMismatchWithLeaseOperation" );
codeMap.set("LeaseNotPresentWithContainerOperation", "LeaseNotPresentWithLeaseOperation");
codeMap.set("LeaseNotPresentWithBlobOperation", "LeaseNotPresentWithLeaseOperation");

errorMsgMap.set("FilesystemNotFound", "The specified filesystem does not exist.");
errorMsgMap.set("RequestBodyTooLarge", "The request body is too large and exceeds the maximum permissible limit");
errorMsgMap.set("FilesystemAlreadyExists", "The specified filesystem already exists.");
errorMsgMap.set("PathAlreadyExists", "The specified path already exists.");
errorMsgMap.set("PathNotFound", "The specified path does not exist.");
errorMsgMap.set("LeaseIsBreakingAndCannotBeAcquired", "The lease ID matched, but the lease is currently in breaking state and cannot be acquired until it is broken.");
errorMsgMap.set("LeaseNotPresentWithLeaseOperation", "The lease ID is not present with the specified lease operation.");
errorMsgMap.set("LeaseIdMismatchWithLeaseOperation", "The lease ID specified did not match the lease ID for the resource with the specified lease operation.");
errorMsgMap.set("LeaseIdMissing", "There is currently a lease on the resource and no lease ID was specified in the request.");
errorMsgMap.set("LeaseIdMismatchWithLeaseOperation", "The lease ID specified did not match the lease ID for the resource with the specified lease operation.");
errorMsgMap.set("LeaseNotPresentWithLeaseOperation", "The lease ID is not present with the specified lease operation.");
errorMsgMap.set("OutOfRangeInput", "One of the request inputs is out of range.");

/**
 * A factory class maintains all Azure Storage Blob service errors.
 *
 * @export
 * @class DataLakeErrorFactory
 */
export default class DataLakeErrorFactory {
  public static blobErrorToDfsError(
    errorCode: string,
    errorMsg: string
  ): [string, string] {
    const mappedErrorCode = codeMap.get(errorCode);
    const newErrorCode = mappedErrorCode ? mappedErrorCode : errorCode;
    const mappedErrorMsg = errorMsgMap.get(newErrorCode);
    const newErrorMsg = mappedErrorMsg ? mappedErrorMsg : errorMsg;
    return [newErrorCode, newErrorMsg];
  }

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

  public static getAuthorizationFailure(context: Context): DataLakeError {
    return new DataLakeError(
      403,
      "AuthorizationFailure",
      "Server failed to authenticate the request. Make sure the value of the Authorization header is formed correctly including the signature.",
      "AuthorizationFailure",
      "Server failed to authenticate the request. Make sure the value of the Authorization header is formed correctly including the signature.",
      context
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
