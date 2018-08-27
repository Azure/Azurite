/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

const AError = require("./../../core/AzuriteError"),
  ErrorCodes = require("./../../core/ErrorCodes");

class QueueExists {
  constructor() {}

    validate({ request = undefined, queue = undefined }) {
        if (queue === undefined) {
            throw ErrorCodes.QueueNotFound;
        }
    }
  }
}

export default new QueueExists;