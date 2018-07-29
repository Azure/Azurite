const AError = from "./../../core/AzuriteError"),
  ErrorCodes = from "./../../core/ErrorCodes");

class TableExists {
  public validate({ request = undefined, table = undefined }) {
    if (request.tableName !== undefined && table === undefined) {
      throw new AError(ErrorCodes.TableNotFound);
    }
  }
}

export default new TableExists();
