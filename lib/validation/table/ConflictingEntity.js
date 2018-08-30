/** @format */

"use strict";

const AError = require("./../../core/AzuriteError"),
  ErrorCodes = require("./../../core/ErrorCodes");

class ConflictingEntity {
  constructor() {}

  validate({ entity = undefined }) {
    if (entity !== undefined) {
      throw new AError(ErrorCodes.EntityAlreadyExists);
    }
  }
}

module.exports = new ConflictingEntity();
