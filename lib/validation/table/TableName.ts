import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";

class TableName {
  public validate(table) {
    if (table === undefined) {
      return;
    }

    if (/^tables$/i.test(table.name)) {
      throw new AzuriteError(ErrorCodes.ReservedTableName);
    }
    if (/[A-Za-z][A-Za-z0-9]{2,62}/i.test(table.name) === false) {
      throw new AzuriteError(ErrorCodes.InvalidInput);
    }
  }
}

export default new TableName();
