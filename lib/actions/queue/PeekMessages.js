'use strict';

const QueueManager = require('./../../core/queue/QueueManager'),
    QueueMessagesListXmlModel = require('./../../xml/queue/QueueMessageList').QueueMessageListXmlModel,
    QueueMessageXmlModel = require('./../../xml/queue/QueueMessageList').QueueMessageXmlModel,
    AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse'),
    N = require('./../../core/HttpHeaderNames');

class PeekMessages {
    constructor() {
    }

    process(request, res) {
        const queue = QueueManager.getQueueAndMessage({ queueName: request.queueName }).queue;
        const messages = queue.peek(request.numOfMessages);
        const model = new QueueMessagesListXmlModel();
        for (const msg of messages) {
            model.add(new QueueMessageXmlModel({
                messageId: msg.messageId,
                expirationTime: new Date(msg.expirationTime * 1000).toUTCString(),
                insertionTime: new Date(msg.insertionTime * 1000).toUTCString(),
                dequeueCount: msg.dequeueCount,
                messageText: msg.msg
            }));
        }
        const xmlBody = model.toXml();
        const response = new AzuriteQueueResponse();
        response.addHttpProperty(N.CONTENT_TYPE, 'application/xml');
        res.set(response.httpProps);
        res.status(200).send(xmlBody);
    }
}

module.exports = new PeekMessages();