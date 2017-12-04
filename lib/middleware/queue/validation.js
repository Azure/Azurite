'use strict';

const BbPromise = require('bluebird'),
    Operations = require('./../../core/Constants').Operations,
    AzuriteQueueRequest = require('./../../model/queue/AzuriteQueueRequest'),
    QueueManager = require('./../../core/queue/QueueManager'),
    // Validation modules
    ValidationContext = require('./../../validation/queue/ValidationContext'),
    QueueCreationValidation = require('./../../validation/queue/QueueCreation'),
    QueueExistsValidation = require('./../../validation/queue/QueueExists'),
    QueueMessageSizeValidation = require('./../../validation/queue/QueueMessageSize'),
    NumOfMessagesValidation = require('./../../validation/queue/NumOfMessages'),
    QueueNameValidation = require('./../../validation/queue/QueueName'),
    MessageExistsValidation = require('./../../validation/queue/MessageExists'),
    PopReceiptValidation = require('./../../validation/queue/PopReceipt'),
    VisibilityTimeoutValueValidation = require('./../../validation/queue/VisibilityTimeoutValue'),
    MessageExpired = require('./../../validation/queue/MessageExpired'),
    NumOfSignedIdentifiersVal = require('./../../validation/NumOfSignedIdentifiers');


module.exports = (req, res, next) => {
    BbPromise.try(() => {
        const request = req.azuriteRequest || {};
        const { queue, message } = QueueManager.getQueueAndMessage({ queueName: request.queueName, messageId: request.messageId });
        const validationContext = new ValidationContext({
            request: request,
            queue: queue,
            message: message,
            operation: req.azuriteOperation
        })
        validations[req.azuriteOperation](validationContext);
        next();
    }).catch((e) => {
        res.status(e.statusCode || 500).send(e.message);
        if (!e.statusCode) throw e;
    });
}

const validations = {};

validations[undefined] = () => {
    // NO VALIDATIONS (this is an unimplemented call)
}

validations[Operations.Queue.LIST_QUEUES] = (valContext) => {
    // NO VALIDATIONS
}

validations[Operations.Queue.CREATE_QUEUE] = (valContext) => {
    valContext
        .run(QueueNameValidation)
        .run(QueueCreationValidation);
}

validations[Operations.Queue.DELETE_QUEUE] = (valContext) => {
    valContext
        .run(QueueExistsValidation);
}

validations[Operations.Queue.SET_QUEUE_METADATA] = (valContext) => {
    valContext
        .run(QueueExistsValidation);
}

validations[Operations.Queue.GET_QUEUE_METADATA] = (valContext) => {
    valContext
        .run(QueueExistsValidation);
}

validations[Operations.Queue.PUT_MESSAGE] = (valContext) => {
    valContext
        .run(QueueExistsValidation)
        .run(VisibilityTimeoutValueValidation)
        .run(QueueMessageSizeValidation);
}

validations[Operations.Queue.GET_MESSAGE] = (valContext) => {
    valContext
        .run(QueueExistsValidation)
        .run(VisibilityTimeoutValueValidation)
        .run(NumOfMessagesValidation);
}

validations[Operations.Queue.CLEAR_MESSAGES] = (valContext) => {
    valContext
        .run(QueueExistsValidation);
}

validations[Operations.Queue.PEEK_MESSAGES] = (valContext) => {
    valContext
        .run(QueueExistsValidation)
        .run(NumOfMessagesValidation);
}

validations[Operations.Queue.DELETE_MESSAGE] = (valContext) => {
    valContext
        .run(QueueExistsValidation)
        .run(MessageExistsValidation)
        .run(MessageExpired)
        .run(PopReceiptValidation);
}

validations[Operations.Queue.UPDATE_MESSAGE] = (valContext) => {
    valContext
        .run(QueueExistsValidation)
        .run(QueueMessageSizeValidation)
        .run(MessageExistsValidation)
        .run(MessageExpired)
        .run(VisibilityTimeoutValueValidation)
        .run(PopReceiptValidation);
}

validations[Operations.Queue.SET_QUEUE_ACL] = (valContext) => {
   valContext
   .run(QueueExistsValidation)
   .run(NumOfSignedIdentifiersVal);
}