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
      "The table to insert doesn't exist",
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
}
