/** @format */

import { AzuriteError }from './../../core/AzuriteError';
import { ErrorCodes } from '../../core/AzuriteError';
import QueueManager from './../../core/queue/QueueManager';

/**
 * Validates whether popreceipt of a given message is still valid.
 */
class PopReceipt {
  constructor() {}

    validate({ request = undefined }) {
        const msg = QueueManager.getQueueAndMessage({ queueName: request.queueName, messageId: request.messageId }).message;
        if (msg.popReceipt !== request.popReceipt) {
            throw ErrorCodes.PopReceiptMismatch;
        }
    }
  }
}

export default new PopReceipt();