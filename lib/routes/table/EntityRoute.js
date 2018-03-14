'use strict';

const env = require('./../../core/env'),
    AzuriteTableRequest = require('./../../model/table/AzuriteTableRequest'),
    Operations = require('./../../core/Constants').Operations.Table;

/*
 * Route definitions for all operation on the 'message' resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-entities
 * for details on specification.
 */
module.exports = (app) => {
    app.route(new RegExp(`\/${env.emulatedStorageAccountName}\/([A-Za-z0-9]+)(.*)`))
        .get((req, res, next) => {
            req.azuriteOperation = Operations.QUERY_ENTITY;
            req.azuriteRequest = new AzuriteTableRequest({ req: req });
            next();
        })
        .head((req, res, next) => {
            next();
        })
        .put((req, res, next) => {
            next();
        })
        .post((req, res, next) => {
            if (req.azuriteOperation === undefined) {
                req.azuriteOperation = Operations.INSERT_ENTITY;
                req.azuriteRequest = new AzuriteTableRequest({ req: req, payload: req.payload });
            }
            next();
        })
        .delete((req, res, next) => {
            req.azuriteOperation = Operations.DELETE_ENTITY;
            req.azuriteRequest = new AzuriteTableRequest({ req: req });
            next();
        });
}