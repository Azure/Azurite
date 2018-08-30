/** @format */

"use strict";

const AError = require("./../../core/AzuriteError"),
  ErrorCodes = require("./../../core/ErrorCodes");

/*
 * Checks whether the container that is to be created already exists.
 * Source of truth is the in-memory DB, not the filesystem.
 */
class ConflictingContainer {
  constructor() {}

  validate({ containerProxy = undefined }) {
    if (containerProxy !== undefined) {
      throw new AError(ErrorCodes.ContainerAlreadyExists);
    }
  }
}

module.exports = new ConflictingContainer();
