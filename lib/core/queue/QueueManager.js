'use strict';

const Queue = require('./../../model/queue/Queue');

/**
 * Manages the lifecycle of all queues in memory. Queues are not persisted in Azurite.
 * 
 * @class QueueManager
 */
class QueueManager {
    constructor() {
        this.queues = {};
    }

    add({ name, metaProps = {} }) {
        this.queues[name] = new Queue(metaProps);
    }

    delete(name) {
        delete this.queues[name];
    }

    getQueueAndMessage({ queueName = undefined, messageId = undefined }) {
        const queue = this.queues[queueName];
        let message = undefined;
        if (queue !== undefined && messageId !== undefined) {
            message = queue.getMessage(messageId);
        }
        return {
            queue: queue,
            message: message
        };
    }

    setQueueMetadata(request){
        const queue = this.getQueueAndMessage(request.queueName);
        queue.metaProps = request.metaProps;
        
    }
}

module.exports = new QueueManager();