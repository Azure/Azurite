'use strict';

import QueueManager from './../../core/queue/QueueManager';
import AzuriteQueueResponse from './../../model/queue/AzuriteQueueResponse';

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

export default new DeleteQueue();