'use strict';

const env = require('./../../core/env'),
    QueueMessageTextXmlModel = require('./../../xml/queue/QueueMessageText'),
    AzuriteQueueRequest = require('../../model/queue/AzuriteQueueRequest'),
    Operations = require('./../../core/Constants').Operations;

/*
 * Route definitions for all operation on the 'message' resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-messages
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/:queue/messages/:messageId*?`)
        .get((req, res, next) => {
            if (req.query.peekonly === 'true') {
                req.azuriteOperation = Operations.Queue.PEEK_MESSAGES;
                req.azuriteRequest = new AzuriteQueueRequest({ req: req });
            } else {
                req.azuriteOperation = Operations.Queue.GET_MESSAGE;
                req.azuriteRequest = new AzuriteQueueRequest({ req: req, operation: Operations.Queue.GET_MESSAGE });
            }
            next();
        })
        .head((req, res, next) => {
            next();
        })
        .put((req, res, next) => {
            req.azuriteOperation = Operations.Queue.UPDATE_MESSAGE;
            QueueMessageTextXmlModel.toJs(req.body)
            .then((payload) => {
                req.azuriteRequest = new AzuriteQueueRequest({ req: req, payload: payload });
                next();
            });
        })
        .post((req, res, next) => {
            req.azuriteOperation = Operations.Queue.PUT_MESSAGE;
            QueueMessageTextXmlModel.toJs(req.body)
                .then((payload) => {
                    req.azuriteRequest = new AzuriteQueueRequest({ req: req, payload: payload });
                    next();
                });
        })
        .delete((req, res, next) => {
            if (req.params.messageId) {
                req.azuriteOperation = Operations.Queue.DELETE_MESSAGE;
            } else {
                req.azuriteOperation = Operations.Queue.CLEAR_MESSAGES;
            }
            req.azuriteRequest = new AzuriteQueueRequest({ req: req });
            next();
        });
}