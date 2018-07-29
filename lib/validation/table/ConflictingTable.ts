const AError = require("./../../core/AzuriteError"),
  ErrorCodes = require("./../../core/ErrorCodes");

class ConflictingTable {
  constructor() {}

  validate({ table = undefined }) {
    if (table !== undefined) {
      throw new AError(ErrorCodes.TableAlreadyExists);
    }
  }
}

export default new ConflictingTable();
