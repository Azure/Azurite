'use strict';

const QueueManager = require('./../../core/queue/queuemanager'),
AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse');

class SetQueueMetadata {
    constructor() {
    }

    process(request, res) {
        QueueManager.setQueueMetadata(request);
        const response = new AzuriteQueueResponse();
        res.set(response.httpProps);
        res.status(204).send();
    }
}

module.exports = new SetQueueMetadata();