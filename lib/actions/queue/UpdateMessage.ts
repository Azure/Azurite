import N from "./../../core/HttpHeaderNames";
import QueueManager from "./../../core/queue/QueueManager";
import AzuriteQueueResponse from "./../../model/queue/AzuriteQueueResponse";

class UpdateMessage {
  public process(request, res) {
    const { queue } = QueueManager.getQueueAndMessage(request.queueName);
    const message = queue.update({
      messageId: request.messageId,
      msg: request.payload.MessageText,
      popReceipt: request.popReceipt,
      visibilityTimeout: request.visibilityTimeout
    });
    const response = new AzuriteQueueResponse();

    response.addHttpProperty(N.POP_RECEIPT, message.popReceipt);
    response.addHttpProperty(
      N.VISIBLE_NEXT_TIME,
      new Date(message.timeNextVisible * 1000).toUTCString()
    );
    res.set(response.httpProps);
    res.status(204).send();
  }
}

export default new UpdateMessage();
