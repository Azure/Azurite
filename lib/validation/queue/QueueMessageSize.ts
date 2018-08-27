'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';

/*
 * Checks whether the queue name adheres to the naming convention 
 * as specified at https://docs.microsoft.com/en-us/rest/api/storageservices/naming-queues-and-metadata
 */
class QueueMessageSize {
    constructor() {
    }

    validate({ request = undefined }) {
        if (request.bodyLength > 64000) {
            throw ErrorCodes.MessageTooLarge;
        }
    }
}

export default new QueueMessageSize;