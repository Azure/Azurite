/**
 * A factory class maintains all Azure Storage table service errors.
 *
 * @export
 * @class StorageErrorFactory
 */
import Context from "../generated/Context";
import StorageError from "./StorageError";

const defaultID: string = "DefaultID";

// see: https://learn.microsoft.com/en-us/rest/api/storageservices/table-service-error-codes
export default class StorageErrorFactory {

  static getBatchDuplicateRowKey(context: Context, rowKey: string) : StorageError{
    return new StorageError(
      400,
      "InvalidDuplicateRow",
      `A command with RowKey '${rowKey}' is already present in the batch. An entity can appear only once in a batch. `,
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getInvalidHeaderValue(
    context: Context,
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    if (additionalMessages === undefined) {
      additionalMessages = {};
    }
    return new StorageError(
      400,
      "InvalidHeaderValue",
      "The value for one of the HTTP headers is not in the correct format.",
      context.contextID || defaultID,
      additionalMessages,
      context
    );
  }

  public static getInvalidAPIVersion(
    context: Context,
    apiVersion?: string
  ): StorageError {
    return new StorageError(
      400,
      "InvalidHeaderValue",
      `The API version ${apiVersion} is not supported by Azurite. Please upgrade Azurite to latest version and retry. If you are using Azurite in Visual Studio, please check you have installed latest Visual Studio patch. Azurite command line parameter \"--skipApiVersionCheck\" or Visual Studio Code configuration \"Skip Api Version Check\" can skip this error. `,
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getInvalidInput(
    context: Context,
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    if (additionalMessages === undefined) {
      additionalMessages = {};
    }
    return new StorageError(
      400,
      "InvalidInput",
      "An error occurred while processing this request.",
      context.contextID || defaultID,
      additionalMessages,
      context
    );
  }

  public static getTableAlreadyExists(context: Context): StorageError {
    return new StorageError(
      409,
      "TableAlreadyExists",
      "The table specified already exists.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getTableNameEmpty(context: Context): StorageError {
    return new StorageError(
      400,
      "TableNameEmpty",
      "The specified table name is empty.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getInvalidOperation(
    context: Context,
    message: string = ""
  ): StorageError {
    return new StorageError(
      400,
      "InvalidOperation",
      message,
      context.contextID || "",
      undefined,
      context
    );
  }

  public static getAuthorizationSourceIPMismatch(
    context: Context
  ): StorageError {
    return new StorageError(
      403,
      "AuthorizationSourceIPMismatch",
      "This request is not authorized to perform this operation using this source IP {SourceIP}.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getAuthorizationProtocolMismatch(
    context: Context
  ): StorageError {
    return new StorageError(
      403,
      "AuthorizationProtocolMismatch",
      "This request is not authorized to perform this operation using this protocol.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getAuthorizationPermissionMismatch(
    context: Context
  ): StorageError {
    return new StorageError(
      403,
      "AuthorizationPermissionMismatch",
      "This request is not authorized to perform this operation using this permission.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getAuthorizationServiceMismatch(
    context: Context
  ): StorageError {
    return new StorageError(
      403,
      "AuthorizationServiceMismatch",
      "This request is not authorized to perform this operation using this service.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getAuthorizationResourceTypeMismatch(
    context: Context
  ): StorageError {
    return new StorageError(
      403,
      "AuthorizationResourceTypeMismatch",
      "This request is not authorized to perform this operation using this resource type.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getAccountNameEmpty(context: Context): StorageError {
    return new StorageError(
      400,
      "AccountNameEmpty",
      "The specified account name is empty.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getTableNotExist(context: Context): StorageError {
    return new StorageError(
      404,
      "TableNotFound",
      "The table specified does not exist.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getAuthorizationFailure(context: Context): StorageError {
    return new StorageError(
      403,
      "AuthorizationFailure",
      // tslint:disable-next-line:max-line-length
      "Server failed to authenticate the request. Make sure the value of the Authorization header is formed correctly including the signature.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getEntityAlreadyExist(context: Context): StorageError {
    return new StorageError(
      409,
      "EntityAlreadyExists",
      "The specified entity already exists.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getPropertiesNeedValue(context: Context): StorageError {
    return new StorageError(
      400,
      "PropertiesNeedValue",
      "The values are not specified for all properties in the entity.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getAtomFormatNotSupported(context: Context): StorageError {
    return new StorageError(
      415,
      "AtomFormatNotSupported",
      "Atom format is not supported.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getPreconditionFailed(context: Context): StorageError {
    return new StorageError(
      412,
      "UpdateConditionNotSatisfied",
      "The update condition specified in the request was not satisfied.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getTableNotFound(context: Context): StorageError {
    return new StorageError(
      404,
      "TableNotFound",
      "The table specified does not exist.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static ResourceNotFound(context: Context): StorageError {
    return new StorageError(
      404,
      "ResourceNotFound",
      "The specified resource does not exist.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getEntityNotFound(context: Context): StorageError {
    return new StorageError(
      404,
      "ResourceNotFound",
      "The specified resource does not exist.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getQueryConditionInvalid(context: Context): StorageError {
    return new StorageError(
      400,
      "InvalidInput",
      "The query condition specified in the request is invalid.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getInvalidResourceName(context: Context): StorageError {
    return new StorageError(
      400,
      "",
      `The specified resource name contains invalid characters.`,
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getOutOfRangeName(context: Context): StorageError {
    return new StorageError(
      400,
      "",
      `The specified resource name length is not within the permissible limits.`,
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getInvalidXmlDocument(context: Context): StorageError {
    return new StorageError(
      400,
      "InvalidXmlDocument",
      `XML specified is not syntactically valid.`,
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getInvalidQueryParameterValue(
    context: Context,
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    if (additionalMessages === undefined) {
      additionalMessages = {};
    }
    return new StorageError(
      400,
      "InvalidQueryParameterValue",
      `Value for one of the query parameters specified in the request URI is invalid.`,
      context.contextID || defaultID,
      additionalMessages,
      context
    );
  }

  public static getInvalidCorsHeaderValue(
    context: Context,
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    return new StorageError(
      400,
      "InvalidHeaderValue",
      "A required CORS header is not present.",
      context.contextID || defaultID,
      additionalMessages,
      context
    );
  }

  public static corsPreflightFailure(
    context: Context,
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    return new StorageError(
      403,
      "CorsPreflightFailure",
      "CORS not enabled or no matching rule found for this request.",
      context.contextID || defaultID,
      additionalMessages,
      context
    );
  }

  public static getInvalidAuthenticationInfo(context: Context): StorageError {
    return new StorageError(
      400,
      "InvalidAuthenticationInfo",
      "Authentication information is not given in the correct format. Check the value of Authorization header.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getAuthenticationFailed(
    context: Context,
    authenticationErrorDetail: string
  ): StorageError {
    return new StorageError(
      403,
      "AuthenticationFailed",
      "Server failed to authenticate the request. Make sure the value of the Authorization header is formed correctly including the signature.",
      context.contextID || defaultID,
      {
        AuthenticationErrorDetail: authenticationErrorDetail
      },
      context
    );
  }

  public static getNotImplementedError(context: Context): StorageError {
    return new StorageError(
      501,
      "NotImplemented",
      "The requested operation is not implemented on the specified resource.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getPropertyValueTooLargeError(context: Context): StorageError {
    return new StorageError(
      400,
      "PropertyValueTooLarge",
      "The property value exceeds the maximum allowed size (64KB). If the property value is a string, it is UTF-16 encoded and the maximum number of characters should be 32K or less.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getRequestBodyTooLarge(context: Context): StorageError {
    return new StorageError(
      413,
      "RequestBodyTooLarge",
      `The request body is too large and exceeds the maximum permissible limit.`,
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getEntityTooLarge(context: Context): StorageError {
    return new StorageError(
      400,
      "EntityTooLarge",
      `The entity is larger than the maximum allowed size (1MB).`,
      context.contextID || defaultID,
      undefined,
      context
    );
  }
}
