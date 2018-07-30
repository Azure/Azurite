import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import QueueManager from "../../core/queue/QueueManager";

/**
 * Validates whether the message is already expired.
 */
class PopReceipt {
  public validate(request) {
    const msg = QueueManager.getQueueAndMessage(
      request.queueName,
      request.messageId
    ).message;
    if (msg.expirationTime < request.now) {
      throw new AzuriteError(ErrorCodes.MessageNotFound);
    }
  }
}

export default new PopReceipt();
