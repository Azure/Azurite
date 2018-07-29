const QueueManager = from "./../../core/queue/QueueManager"),
  QueueMessagesListXmlModel = from "./../../xml/queue/QueueMessageList")
    .QueueMessageListXmlModel,
  QueueMessageXmlModel = from "./../../xml/queue/QueueMessageList")
    .QueueMessageXmlModel,
  AzuriteQueueResponse = from "./../../model/queue/AzuriteQueueResponse");
import N from "./../../core/HttpHeaderNames";

class PeekMessages {
  public process(request, res) {
    const queue = QueueManager.getQueueAndMessage({
      queueName: request.queueName
    }).queue;
    const messages = queue.peek(request.numOfMessages);
    const model = new QueueMessagesListXmlModel();
    for (const msg of messages) {
      model.add(
        new QueueMessageXmlModel({
          messageId: msg.messageId,
          expirationTime: new Date(msg.expirationTime * 1000).toUTCString(),
          insertionTime: new Date(msg.insertionTime * 1000).toUTCString(),
          dequeueCount: msg.dequeueCount,
          messageText: msg.msg
        })
      );
    }
    const xmlBody = model.toXml();
    const response = new AzuriteQueueResponse();
    response.addHttpProperty(N.CONTENT_TYPE, "application/xml");
    res.set(response.httpProps);
    res.status(200).send(xmlBody);
  }
}

export default new PeekMessages();
