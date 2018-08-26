'use strict';

import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';
import QueueManager from './../../core/queue/QueueManager';

/**
 * Validates whether the message with a given messageId exists.
 */
class MessageExists {
    constructor() {
    }

    validate({ request = undefined }) {
        if (QueueManager.getQueueAndMessage({ queueName: request.queueName, messageId: request.messageId }).message === undefined) {
            throw new AError(ErrorCodes.MessageNotFound);
        }
    }
}

export default new MessageExists();