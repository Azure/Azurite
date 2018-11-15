/** @format */

"use strict";

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

module.exports = new ConflictingTable();
