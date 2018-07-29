const AError = require("./../../core/AzuriteError"),
  ErrorCodes = require("./../../core/ErrorCodes"),
  QueueManager = require("./../../core/queue/QueueManager");

/**
 * Validates whether popreceipt of a given message is still valid.
 */
class PopReceipt {
  constructor() {}

  validate({ request = undefined }) {
    const msg = QueueManager.getQueueAndMessage({
      queueName: request.queueName,
      messageId: request.messageId
    }).message;
    if (msg.popReceipt !== request.popReceipt) {
      throw new AError(ErrorCodes.PopReceiptMismatch);
    }
  }
}

export default new PopReceipt();
