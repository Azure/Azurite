'use strict';

const QueueManager = require('./../../core/queue/queuemanager'),
    AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse');

class PutMessage {
    constructor() {
    }

    process(request, res) {
        const { queue } = QueueManager.getQueueAndMessage({ queueName: request.queueName });
        queue.put({ msg: request.payload.MessageText, visibilityTimeout: request.visibilityTimeout, messageTtl: request.messageTtl });
        const response = new AzuriteQueueResponse();
        res.set(response.httpProps);
        res.status(201).send();
    }
}

module.exports = new PutMessage();