'use strict';

const AError = require('./../../AzuriteError'),
    ErrorCodes = require('./../../ErrorCodes');

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
            throw new AError(ErrorCodes.OutOfRangeInput);
        }

        if (name.includes('--') || name[0] === '-' || name[name.length - 1] === '-') {
            throw new AError(ErrorCodes.InvalidInput);
        }

        // Matches non-alphanumeric characters
        const re = new RegExp(/\W|_/);
        if (re.test(name.replace('-', ''))) { // Fixme: exclude '-' in regex  
            throw new AError(ErrorCodes.InvalidInput);
        }
    }
}

module.exports = new QueueName;