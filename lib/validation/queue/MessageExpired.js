'use strict';

const AError = require('./../../core/AzuriteError'),
    ErrorCodes = require('./../../core/ErrorCodes'),
    QueueManager = require('./../../core/queue/QueueManager');

/**
 * Validates whether the message is already expired.
 */
class PopReceipt {
    constructor() {
    }

    validate({ request = undefined }) {
        const msg = QueueManager.getQueueAndMessage({ queueName: request.queueName, messageId: request.messageId }).message;
        if (msg.expirationTime < request.now) {
            throw new AError(ErrorCodes.MessageNotFound);
        }
    }
}

module.exports = new PopReceipt();