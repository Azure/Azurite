/**
 * A factory class maintains all Azure Storage table service errors.
 *
 * @export
 * @class StorageErrorFactory
 */
import Context from "../generated/Context";
import StorageError from "./StorageError";

const defaultID: string = "DefaultID";

export default class StorageErrorFactory {
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

  public static getTableAlreadyExists(context: Context): StorageError {
    return new StorageError(
      409,
      "TableAlreadyExists",
      "The specified table already exists.",
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
      400,
      "AccountNameEmpty",
      "The table you want to manipulate doesn't exist",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getEntityNotExist(context: Context): StorageError {
    return new StorageError(
      409,
      "EntityDoesNotExist",
      "The entity to update doesn't exist in the table",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static getEntityAlreadyExist(context: Context): StorageError {
    return new StorageError(
      409,
      "EntityAlreadyExist",
      "The entity to insert already exists in the table",
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

  public static getContentTypeNotSupported(context: Context): StorageError {
    return new StorageError(
      400,
      "contentTypeNotSupported",
      "Payload Type is not supported yet. Only support json.",
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

  public static getEntityNotFound(context: Context): StorageError {
    return new StorageError(
      404,
      "EntityNotFound",
      "The specified entity does not exist.",
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
}
