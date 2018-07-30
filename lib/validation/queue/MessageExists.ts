constimport AError from "./../../core/AzuriteError";
  ErrorCodes  from "./../../core/ErrorCodes"),
  QueueManager  from "./../../core/queue/QueueManager");

/**
 * Validates whether the message with a given messageId exists.
 */
class MessageExists {
  public validate({ request = undefined }) {
    if (
      QueueManager.getQueueAndMessage({
        queueName: request.queueName,
        messageId: request.messageId
      }).message === undefined
    ) {
      throw new AError(ErrorCodes.MessageNotFound);
    }
  }
}

export default new MessageExists();
