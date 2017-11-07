'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../../core/Constants').Operations,
    // Actions
    deleteQueue = require('./../../actions/queue/DeleteQueue'),
    createQueue = require('./../../actions/queue/CreateQueue');

module.exports = (req, res) => {
    BbPromise.try(() => {
        actions[req.azuriteOperation](req.azuriteRequest, res);
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

const actions = {};
actions[Operations.Queue.CREATE_QUEUE] = (request, res) => {
    createQueue.process(request, res);
}

actions[Operations.Queue.DELETE_QUEUE] = (request, res) => {
    deleteQueue.process(request, res);
}

actions[Operations.Queue.SET_QUEUE_METADATA] = (request, res) => {
    setQueueMetadata.process(request, res);
}
