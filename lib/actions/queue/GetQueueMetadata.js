'use strict';

const QueueManager = require('./../../core/queue/QueueManager'),
    AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse');

class SetQueueMetadata {
    constructor() {
    }

    process(request, res) {
        //ToDo Implement GetQueueMetadata
        QueueManager.setQueueMetadata(request);
        const response = new AzuriteQueueResponse();
        res.set(response.httpProps);
        res.status(200).send();
    }
}

module.exports = new SetQueueMetadata();