const QueueManager = from "./../../core/queue/QueueManager"),
  QueueMessagesListXmlModel = from "./../../xml/queue/QueueMessageList")
    .QueueMessageListXmlModel,
  QueueMessageXmlModel = from "./../../xml/queue/QueueMessageList")
    .QueueMessageXmlModel,
  N = from "./../../core/HttpHeaderNames"),
  AzuriteQueueResponse = from "./../../model/queue/AzuriteQueueResponse");

class UpdateMessage {
  public process(request, res) {
    const queue = QueueManager.getQueueAndMessage({
        queueName: request.queueName
      }).queue,
      message = queue.update({
        messageId: request.messageId,
        popReceipt: request.popReceipt,
        visibilityTimeout: request.visibilityTimeout,
        msg: request.payload.MessageText
      }),
      response = new AzuriteQueueResponse();

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
