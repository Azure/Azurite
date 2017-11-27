'use strict';

const QueueManager = require('./../../core/queue/QueueManager'),
    QueueMessagesListXmlModel = require('./../../xml/queue/QueueMessageList').QueueMessageListXmlModel,
    QueueMessageXmlModel = require('./../../xml/queue/QueueMessageList').QueueMessageXmlModel,
    N = require('./../../core/HttpHeaderNames'),
    AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse');

class UpdateMessage {
    constructor() {
    }

    process(request, res) {
        const queue = QueueManager.getQueueAndMessage({ queueName: request.queueName }).queue,
            message = queue.update({ messageId: request.messageId, popReceipt: request.popReceipt, visibilityTimeout: request.visibilityTimeout, msg: request.payload.MessageText }),
            response = new AzuriteQueueResponse();

        response.addHttpProperty(N.POP_RECEIPT, message.popReceipt);
        res.set(response.httpProps);
        res.status(204).send();
    }
}

module.exports = new UpdateMessage();