'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../../Constants').Operations,
    AzuriteQueueRequest = require('./../../model/queue/AzuriteQueueRequest'),
    QueueManager = require('./../../QueueManager'),
    // Validation modules
    ValidationContext = require('./../../validation/queue/ValidationContext'),
    QueueCreationValidation = require('./../../validation/queue/QueueCreation'),
    QueueNameValidation = require('./../../validation/queue/QueueName');

module.exports = (req, res, next) => {
    BbPromise.try(() => {
        if (req.azuriteOperation === undefined) {
            res.status(501).send('Not Implemented yet.');
            return;
        }
        const request = req.azuriteRequest;
        const { queue, message } = QueueManager.getQueueAndMessage({ queueName: request.queueName, messageId: request.messageId });
        const validationContext = new ValidationContext({
            request: request,
            queue: queue,
            message: message
        })
        validations[req.azuriteOperation](request, validationContext);
        next();
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

const validations = {};

validations[Operations.Queue.CREATE_QUEUE] = (request, valContext) => {
    valContext
        .run(QueueNameValidation)
        .run(QueueCreationValidation);
}