'use strict';

const Queue = require('./model/queue/Queue');

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
        delete this.queue[name];
    }
}

module.exports = new QueueManager();