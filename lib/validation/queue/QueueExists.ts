/** @format */

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';

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

export default new QueueExists;