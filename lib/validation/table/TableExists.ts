import AError from "./../../core/AzuriteError";
import ErrorCodes from "./../../core/ErrorCodes";

class TableExists {
  public validate({ request, table }) {
    if (request.tableName !== undefined && table === undefined) {
      throw new AError(ErrorCodes.TableNotFound);
    }
  }
}

export default new TableExists();
