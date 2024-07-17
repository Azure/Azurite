import StorageError from "./StorageError";

const defaultID: string = "DefaultID";

/**
 * A factory class maintains all Azure Storage queue service errors.
 *
 * @export
 * @class StorageErrorFactory
 */
export default class StorageErrorFactory {
  public static notImplement(contextID: string = defaultID): StorageError {
    return new StorageError(
      500,
      "functionNotImplement",
      `No function.`,
      contextID
    );
  }

  public static InternalError(contextID: string = defaultID): StorageError {
    return new StorageError(
      500,
      "InternalError",
      `The server encountered an internal error. Please retry the request.`,
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

  public static corsPreflightFailure(
    contextID: string = defaultID,
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

  public static getInvalidUri(
    contextID: string = defaultID,
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    return new StorageError(
      400,
      "InvalidUri",
      "The specified resource name contains invalid characters.",
      contextID
    );
  }

  public static getInvalidAuthenticationInfo(
    contextID: string = defaultID
  ): StorageError {
    return new StorageError(
      400,
      "InvalidAuthenticationInfo",
      "Authentication information is not given in the correct format. Check the value of Authorization header.",
      contextID
    );
  }

  public static getAuthenticationFailed(
    contextID: string = defaultID,
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

  public static getInvalidCorsHeaderValue(
    contextID: string = defaultID,
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

  public static getAuthorizationFailure(
    contextID: string = defaultID
  ): StorageError {
    return new StorageError(
      403,
      "AuthenticationFailed",
      "Server failed to authenticate the request." +
        "Make sure the value of the Authorization header is formed correctly including the signature.",
      contextID
    );
  }

  public static getInvalidOperation(
    contextID: string,
    message: string = ""
  ): StorageError {
    return new StorageError(400, "InvalidOperation", message, contextID);
  }

  public static ResourceNotFound(
    contextID: string
  ): StorageError {
    return new StorageError(
      404,
      "ResourceNotFound",
      "The specified resource does not exist.",
      contextID
    )
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

  public static getInvalidXmlDocument(
    contextID: string = defaultID,
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    if (additionalMessages === undefined) {
      additionalMessages = {};
    }
    return new StorageError(
      400,
      "InvalidXmlDocument",
      `XML specified is not syntactically valid.`,
      contextID,
      additionalMessages
    );
  }

  public static getInvalidQueryParameterValue(
    contextID: string = defaultID,
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    if (additionalMessages === undefined) {
      additionalMessages = {};
    }
    return new StorageError(
      400,
      "InvalidQueryParameterValue",
      `Value for one of the query parameters specified in the request URI is invalid.`,
      contextID,
      additionalMessages
    );
  }

  public static getOutOfRangeQueryParameterValue(
    contextID: string = defaultID,
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    if (additionalMessages === undefined) {
      additionalMessages = {};
    }
    return new StorageError(
      400,
      "OutOfRangeQueryParameterValue",
      `One of the query parameters specified in the request URI is outside the permissible range.`,
      contextID,
      additionalMessages
    );
  }

  public static getRequestBodyTooLarge(
    contextID: string = defaultID,
    additionalMessages?: { [key: string]: string }
  ): StorageError {
    return new StorageError(
      413,
      "RequestBodyTooLarge",
      `The request body is too large and exceeds the maximum permissible limit.`,
      contextID,
      additionalMessages
    );
  }

  public static getMessageTooLarge(
    contextID: string = defaultID
  ): StorageError {
    return new StorageError(
      400,
      "MessageTooLarge",
      `The message exceeds the maximum allowed size.`,
      contextID
    );
  }

  public static getPopReceiptMismatch(
    contextID: string = defaultID
  ): StorageError {
    return new StorageError(
      400,
      "PopReceiptMismatch",
      `The specified pop receipt did not match the pop receipt for a dequeued message.`,
      contextID
    );
  }

  public static getMessageNotFound(
    contextID: string = defaultID
  ): StorageError {
    return new StorageError(
      404,
      "MessageNotFound",
      `The specified message does not exist.`,
      contextID
    );
  }

  public static getInvalidResourceName(
    contextID: string = defaultID
  ): StorageError {
    return new StorageError(
      400,
      "InvalidResourceName",
      `The specified resource name contains invalid characters.`,
      contextID
    );
  }

  public static getOutOfRangeName(contextID: string = defaultID): StorageError {
    return new StorageError(
      400,
      "OutOfRangeInput",
      `The specified resource name length is not within the permissible limits.`,
      contextID
    );
  }

  public static getQueueAlreadyExists(
    contextID: string = defaultID
  ): StorageError {
    return new StorageError(
      409,
      "QueueAlreadyExists",
      "The specified queue already exists.",
      contextID
    );
  }

  public static getQueueNotFound(contextID: string = defaultID): StorageError {
    return new StorageError(
      404,
      "QueueNotFound",
      "The specified queue does not exist.",
      contextID
    );
  }
}
