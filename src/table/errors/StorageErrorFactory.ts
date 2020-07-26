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

  public static TableAlreadyExists(context: Context): StorageError {
    return new StorageError(
      400,
      "TableAlreadyExists",
      "The table to create already exists.",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static TableNotExist(context: Context): StorageError {
    return new StorageError(
      400,
      "AccountNameEmpty",
      "The table to insert doesn't exist",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static insertEntityAlreadyExist(context: Context): StorageError {
    return new StorageError(
      400,
      "insertEntityAlreadyExist",
      "The entity to insert already exists in the table",
      context.contextID || defaultID,
      undefined,
      context
    );
  }

  public static contentTypeNotSupported(context: Context): StorageError {
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
