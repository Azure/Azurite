'use strict';

import QueueManager from './../../core/queue/QueueManager';
import { QueueMessageXmlModel, QueueMessagesListXmlModel } from './../../xml/queue/QueueMessageList';
import N from './../../core/HttpHeaderNames';
import AzuriteQueueResponse from './../../model/queue/AzuriteQueueResponse';

class UpdateMessage {
    constructor() {
    }

    process(request, res) {
        const queue = QueueManager.getQueueAndMessage({ queueName: request.queueName }).queue,
            message = queue.update({ messageId: request.messageId, popReceipt: request.popReceipt, visibilityTimeout: request.visibilityTimeout, msg: request.payload.MessageText }),
            response = new AzuriteQueueResponse();

        response.addHttpProperty(N.POP_RECEIPT, message.popReceipt);
        response.addHttpProperty(N.VISIBLE_NEXT_TIME, new Date(message.timeNextVisible * 1000).toUTCString());
        res.set(response.httpProps);
        res.status(204).send();
    }
}

export default new UpdateMessage();