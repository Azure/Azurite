/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

/**
 * Validates the correct number space of the number of messages query parameter 'numofmessages'.
 * Parameter must be a non-zero integer n with 1 <= n <= 32
 */
class NumOfMessages {
  constructor() {}

    validate({ request = undefined }) {
        if (request.numOfMessages < 1 || request.numOfMessages > 32) {
            throw ErrorCodes.OutOfRangeInput;
        }
    }
  }
}

export default new NumOfMessages();