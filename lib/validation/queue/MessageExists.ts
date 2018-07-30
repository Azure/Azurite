import AzuriteError from "../../core/AzuriteError";
import ErrorCodes from "../../core/ErrorCodes";
import QueueManager from "../../core/queue/QueueManager";

/**
 * Validates whether the message with a given messageId exists.
 */
class MessageExists {
  public validate(request) {
    if (
      QueueManager.getQueueAndMessage(request.queueName, request.messageId)
        .message === undefined
    ) {
      throw new AzuriteError(ErrorCodes.MessageNotFound);
    }
  }
}

export default new MessageExists();
