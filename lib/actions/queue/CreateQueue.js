'use strict';

const QueueManager = require('./../../QueueManager'),
    AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse');

class CreateQueue {
    constructor() {
    }

    process(request, res) {
        const { queue } = QueueManager.getQueueAndMessage({ queueName: request.queueName });
        const response = new AzuriteQueueResponse();
        res.set(response.httpProps);
        if (queue !== undefined) {
            // Queue already exists, abd existing metadata is identical to the metadata specified on the Create Queue request
            res.status(204).send();
            return;
        }

        QueueManager.add({ name: request.queueName, metaProps: request.metaProps });
        res.status(201).send();
    }
}

module.exports = new CreateQueue();