'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../../core/Constants').Operations.Table;

module.exports = (req, res) => {
    BbPromise.try(() => {
        actions[req.azuriteOperation](req.azuriteRequest, res);
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

const actions = {};

actions[undefined] = (request, res) => {
    res.status(501).send('Not Implemented yet.');
}

actions[Operations.CREATE_TABLE] = (request, res) => {
    
}