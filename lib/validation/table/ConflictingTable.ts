import AError from "./../../core/AzuriteError";
import ErrorCodes from "./../../core/ErrorCodes";

class ConflictingTable {
  public validate({ table }) {
    if (table !== undefined) {
      throw new AError(ErrorCodes.TableAlreadyExists);
    }
  }
}

export default new ConflictingTable();
