'use strict';

const QueueManager = require('./../../core/queue/QueueManager'),
    AzuriteQueueResponse = require('./../../model/queue/AzuriteQueueResponse');

class CreateTable {
    constructor() {
    }

    process(request, res) {
        
        res.status(201).send();
    }
}

module.exports = new CreateTable();