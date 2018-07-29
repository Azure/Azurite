const AError = from "./../../core/AzuriteError"),
  ErrorCodes = from "./../../core/ErrorCodes");

class ConflictingTable {
  public validate({ table = undefined }) {
    if (table !== undefined) {
      throw new AError(ErrorCodes.TableAlreadyExists);
    }
  }
}

export default new ConflictingTable();
