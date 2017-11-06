'use strict';

const QueueManager = require('./../../core/queue/queuemanager'),
    AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse');

class DeleteQueue {
    constructor() {
    }

    process(request, res) {
        QueueManager.delete(request.queueName);
        const response = new AzuriteQueueResponse();
        res.set(response.httpProps);
        res.status(204).send();
    }
}

module.exports = new DeleteQueue();