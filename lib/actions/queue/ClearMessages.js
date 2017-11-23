'use strict';

const QueueManager = require('./../../core/queue/QueueManager'),
    AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse');

class ClearMessages {
    constructor() {
    }

    process(request, res) {
        const queue = QueueManager.getQueueAndMessage({ queueName: request.queueName }).queue;
        queue.clear();
        const response = new AzuriteQueueResponse();
        res.set(response.httpProps);
        res.status(204).send();
    }
}

module.exports = new ClearMessages();