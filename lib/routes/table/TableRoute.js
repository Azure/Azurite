'use strict';

const env = require('./../../core/env'),
    Operations = require('./../../core/Constants').Operations.Table;


/*
 * Route definitions for all operation on the 'message' resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-tables
 * for details on specification.
 */
module.exports = (app) => {
    app.route(`/${env.emulatedStorageAccountName}/Tables`)
        .get((req, res, next) => {
            next();
        })
        .head((req, res, next) => {
            next();
        })
        .put((req, res, next) => {
            next();
        })
        .post((req, res, next) => {
            req.azuriteOperation = Operations.CREATE_TABLE;
            req.azuriteRequest = new AzuriteQueueRequest({ req: req, operation: Operations.Queue.GET_MESSAGE });
            next();
        })
        .delete((req, res, next) => {
            next();
        });
}