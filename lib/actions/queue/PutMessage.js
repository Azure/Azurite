'use strict';

import QueueManager from './../../core/queue/QueueManager';
import { QueueMessageListXmlModel as QueueMessagesListXmlModel } from './../../xml/queue/QueueMessageList';
import { QueueMessageXmlModel } from './../../xml/queue/QueueMessageList';
import AzuriteQueueResponse from './../../model/queue/AzuriteQueueResponse';
import N from './../../core/HttpHeaderNames';

class PutMessage {
    constructor() {
    }

    process(request, res) {
        const { queue } = QueueManager.getQueueAndMessage({ queueName: request.queueName });
        const message = queue.put({ now: request.now, msg: request.payload.MessageText, visibilityTimeout: request.visibilityTimeout, messageTtl: request.messageTtl });
        const model = new QueueMessagesListXmlModel();
        model.add(new QueueMessageXmlModel(
            {
                messageId: message.messageId,
                expirationTime: new Date(message.expirationTime*1000).toUTCString(),
                insertionTime: new Date(message.insertionTime*1000).toUTCString(),
                popReceipt: message.popReceipt,
                timeNextVisible: new Date(message.timeNextVisible*1000).toUTCString()
            }));
        const xmlBody = model.toXml();
        const response = new AzuriteQueueResponse();
        response.addHttpProperty(N.CONTENT_TYPE, 'application/xml');
        res.set(response.httpProps);
        res.status(201).send(xmlBody);
    }
}

export default new PutMessage();