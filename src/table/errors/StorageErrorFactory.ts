/**
 * A factory class maintains all Azure Storage table service errors.
 *
 * @export
 * @class StorageErrorFactory
 */

import StorageError from "./StorageError";

const defaultID: string = "DefaultID";

export default class StorageErrorFactory {
  public static getTableAlreadyExists(
    contextID: string = defaultID
  ): StorageError {
    return new StorageError(
      409,
      "TableAlreadyExists",
      "The specified table already exists.",
      contextID
    );
  }

  public static getTableNameEmpty(
    contextID: string = defaultID
  ): StorageError {
    return new StorageError(
      400,
      "TableNameEmpty",
      "The specified table name is empty.",
      contextID
    );
  }

  public static getAccountNameEmpty(
    contextID: string = defaultID
  ): StorageError {
    return new StorageError(
      400,
      "AccountNameEmpty",
      "The specified account name is empty.",
      contextID
    );
  }
}
