'use strict';

const QueueManager = require('./../../core/queue/QueueManager'),
    AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse');

class GetQueueMetadata {
    constructor() {
    }

    process(request, res) {
        const queue = QueueManager.getQueueAndMessage({ queueName: request.queueName }).queue,
            metaProps = queue.metaProps,
            queueLength = queue.getLength(),
            response = new AzuriteQueueResponse();
        response.addMetaProps(metaProps);
        response.addHttpProperty(`x-ms-approximate-messages-count`, queueLength);
        res.set(response.httpProps);
        res.status(200).send();
    }
}

module.exports = new GetQueueMetadata();
