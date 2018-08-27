'use strict';

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';
import QueueManager from './../../core/queue/QueueManager';

/**
 * Validates whether the message is already expired.
 */
class PopReceipt {
    constructor() {
    }

    validate({ request = undefined }) {
        const msg = QueueManager.getQueueAndMessage({ queueName: request.queueName, messageId: request.messageId }).message;
        if (msg.expirationTime < request.now) {
            throw ErrorCodes.MessageNotFound;
        }
    }
}

export default new PopReceipt();