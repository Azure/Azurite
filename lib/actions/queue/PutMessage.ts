import N from "./../../core/HttpHeaderNames";
import QueueManager from "./../../core/queue/QueueManager";
import AzuriteQueueResponse from "./../../model/queue/AzuriteQueueResponse";
import {
  QueueMessagesListXmlModel,
  QueueMessageXmlModel
} from "./../../xml/queue/QueueMessageList";

class PutMessage {
  public process(request, res) {
    const { queue } = QueueManager.getQueueAndMessage({
      queueName: request.queueName
    });
    const message = queue.put({
      messageTtl: request.messageTtl,
      msg: request.payload.MessageText,
      now: request.now,
      visibilityTimeout: request.visibilityTimeout
    });
    const model = new QueueMessagesListXmlModel();
    model.add(
      new QueueMessageXmlModel({
        dequeueCount: undefined,
        expirationTime: new Date(message.expirationTime * 1000).toUTCString(),
        insertionTime: new Date(message.insertionTime * 1000).toUTCString(),
        messageId: message.messageId,
        messageText: undefined,
        popReceipt: message.popReceipt,
        timeNextVisible: new Date(message.timeNextVisible * 1000).toUTCString()
      })
    );
    const xmlBody = model.toXml();
    const response = new AzuriteQueueResponse();
    response.addHttpProperty(N.CONTENT_TYPE, "application/xml");
    res.set(response.httpProps);
    res.status(201).send(xmlBody);
  }
}

export default new PutMessage();
