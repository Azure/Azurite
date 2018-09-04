/** @format */

"use strict";

const AError = require("./../../core/AzuriteError"),
  ErrorCodes = require("./../../core/ErrorCodes");

class QueueExists {
  constructor() {}

  validate({ request = undefined, queue = undefined }) {
    if (queue === undefined) {
      throw new AError(ErrorCodes.QueueNotFound);
    }
  }
}

module.exports = new QueueExists();
