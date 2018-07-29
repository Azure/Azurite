const AError = from "./../../core/AzuriteError"),
  ErrorCodes = from "./../../core/ErrorCodes"),
  QueueManager = from "./../../core/queue/QueueManager");

/**
 * Validates whether the message is already expired.
 */
class PopReceipt {
  public validate({ request = undefined }) {
    const msg = QueueManager.getQueueAndMessage({
      queueName: request.queueName,
      messageId: request.messageId
    }).message;
    if (msg.expirationTime < request.now) {
      throw new AError(ErrorCodes.MessageNotFound);
    }
  }
}

export default new PopReceipt();
