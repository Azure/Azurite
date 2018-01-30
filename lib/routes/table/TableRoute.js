'use strict';

const env = require('./../../core/env'),
    AzuriteTableRequest = require('./../../model/table/AzuriteTableRequest'),
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
            const payload = JSON.parse(req.payload);
            req.azuriteRequest = new AzuriteTableRequest({ req: req, payload: payload });
            next();
        })
        .delete((req, res, next) => {
            next();
        });
}