'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../../Constants').Operations,
    // Actions
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