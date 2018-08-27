import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import QueueManager from "../../core/queue/QueueManager";
/**
 * Validates whether popreceipt of a given message is still valid.
 */
class PopReceipt {
  public validate(request) {
    const msg = QueueManager.getQueueAndMessage(
      request.queueName,
      request.messageId
    ).message;
    if (msg.popReceipt !== request.popReceipt) {
      throw new AzuriteError(ErrorCodes.PopReceiptMismatch);
    }
  }
}

export default new PopReceipt();
