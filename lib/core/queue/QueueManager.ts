'use strict';

import Queue from './../../model/queue/Queue';

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

    listQueues({ prefix = '', marker = 0, maxresults = 5000 }) {
        const filteredQueues = Object.keys(this.queues)
            .filter((queueName) => {
                return queueName.startsWith(prefix);
            })
            .reduce((list, queueName) => {
                list.push({ name: queueName, metaProps: this.queues[queueName].metaProps });
                return list;
            }, [])
            .sort((lhs, rhs) => {
                return lhs.name > rhs.name;
            });

        const paginatedQueues = filteredQueues.slice(marker * maxresults, (marker + 1) * maxresults);
        return {
            queues: paginatedQueues,
            nextMarker: (this.queues.length > (marker + 1) * maxresults) ? marker + 1 : undefined
        }
    }

    setQueueMetadata(request) {
        const { queue } = this.getQueueAndMessage({ queueName: request.queueName });
        queue.metaProps = request.metaProps;
    }
}

export default new QueueManager();