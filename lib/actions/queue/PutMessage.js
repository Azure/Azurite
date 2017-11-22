'use strict';

const QueueManager = require('./../../core/queue/QueueManager'),
    QueueMessagesListXmlModel = require('./../../xml/queue/QueueMessageList').QueueMessageListXmlModel,
    QueueMessageXmlModel = require('./../../xml/queue/QueueMessageList').QueueMessageXmlModel,
    AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse');

class PutMessage {
    constructor() {
    }

    process(request, res) {
        const { queue } = QueueManager.getQueueAndMessage({ queueName: request.queueName });
        const message = queue.put({ msg: request.payload.MessageText, visibilityTimeout: request.visibilityTimeout, messageTtl: request.messageTtl });
        const model = new QueueMessagesListXmlModel();
        model.add(new QueueMessageXmlModel(
            {
                messageId: message.messageId,
                expirationTime: message.expirationTime,
                insertionTime: message.insertionTime,
                popReceipt: message.popReceipt,
                timeNextVisible: message.timeNextVisible
            }));
        const xmlBody = model.toXml();
        const response = new AzuriteQueueResponse();
        res.set(response.httpProps);
        res.status(201).send(xmlBody);
    }
}

module.exports = new PutMessage();