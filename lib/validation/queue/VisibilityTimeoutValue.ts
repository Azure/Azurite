/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

import * as Operation from './../../core/Constants';
const Operations = Operation.Operations.Queue;

/*
 * Checks whether the visibility timeout value adheres to the specifications at
 * https://docs.microsoft.com/en-us/rest/api/storageservices/update-message
 * and https://docs.microsoft.com/en-us/rest/api/storageservices/get-messages
 */
class VisibilityTimeoutValue {
  constructor() {}

    validate({ request = undefined, operation = undefined, message = undefined }) {
        if (operation === Operations.GET_MESSAGE) {
            if (request.visibilityTimeout < 1 || request.visibilityTimeout > 60 * 60 * 24 * 7) {
                throw ErrorCodes.OutOfRangeInput;
            }
        }
        else {
            if (request.visibilityTimeout < 0 || request.visibilityTimeout > 60 * 60 * 24 * 7) {
                throw ErrorCodes.OutOfRangeInput;
            }
            if (operation === Operations.PUT_MESSAGE) {
                if (request.now + request.visibilityTimeout > request.now + request.messageTtl) {
                    throw ErrorCodes.OutOfRangeInput;
                }
            }
            if (operation === Operations.UPDATE_MESSAGE) {
                if (request.now + request.visibilityTimeout > message.expirationTime) {
                    throw ErrorCodes.OutOfRangeInput;
                }
            }
            
        }
      }
    }
  }
}

export default new VisibilityTimeoutValue();