constimport AError from "./../../core/AzuriteError";
  ErrorCodes  from "./../../core/ErrorCodes"),
  QueueManager  from "./../../core/queue/QueueManager");

/**
 * Validates whether popreceipt of a given message is still valid.
 */
class PopReceipt {
  public validate({ request = undefined }) {
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
