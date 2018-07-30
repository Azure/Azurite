import N from "./../../core/HttpHeaderNames";
import QueueManager from "./../../core/queue/QueueManager";
import AzuriteQueueResponse from "./../../model/queue/AzuriteQueueResponse";
import {
  QueueMessagesListXmlModel,
  QueueMessageXmlModel
} from "./../../xml/queue/QueueMessageList";

class GetMessages {
  public process(request, res) {
    const queue = QueueManager.getQueueAndMessage({
      queueName: request.queueName
    }).queue;
    const messages = queue.gett({
      numOfMessages: request.numOfMessages,
      visibilityTimeout: request.visibilityTimeout
    });
    const model = new QueueMessagesListXmlModel();
    for (const msg of messages) {
      model.add(
        new QueueMessageXmlModel({
          dequeueCount: msg.dequeueCount,
          expirationTime: new Date(msg.expirationTime * 1000).toUTCString(),
          insertionTime: new Date(msg.insertionTime * 1000).toUTCString(),
          messageId: msg.messageId,
          messageText: msg.msg,
          popReceipt: msg.popReceipt,
          timeNextVisible: new Date(msg.timeNextVisible * 1000).toUTCString()
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

export default new GetMessages();
