'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';


class QueueExists {
    constructor() {
    }

    validate({ request = undefined, queue = undefined }) {
        if (queue === undefined) {
            throw ErrorCodes.QueueNotFound;
        }
    }
}

export default new QueueExists;