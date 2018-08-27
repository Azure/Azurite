'use strict';
import { ErrorCodes } from '../../core/AzuriteError';
import { AzuriteError }from './../../core/AzuriteError';

/*
 * Checks whether the queue name adheres to the naming convention 
 * as specified at https://docs.microsoft.com/en-us/rest/api/storageservices/naming-queues-and-metadata
 */
class QueueName {
    constructor() {
    }

    validate({ request = undefined }) {
        const name = request.queueName;
        if (name.length < 3 || name.length > 63) {
            throw ErrorCodes.OutOfRangeInput;
        }
        
        if (/^([a-z0-9]+)(-[a-z0-9]+)*$/i.test(name) === false) { 
            throw ErrorCodes.InvalidInput;
        }
    }
}

export default new QueueName;