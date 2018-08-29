'use strict';

import env from './../../core/env';
import AzuriteTableRequest from './../../model/table/AzuriteTableRequest';

import * as Operation from './../../core/Constants';
const Operations = Operation.Operations.Table;

/*
 * Route definitions for all operation on the 'message' resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-tables
 * for details on specification.
 */
export default (app) => {
    app.route(new RegExp(`\/${env.emulatedStorageAccountName}\/Tables(.*)`))
        .get((req, res, next) => {
            req.azuriteOperation = Operations.QUERY_TABLE;
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
            req.azuriteOperation = Operations.CREATE_TABLE;
            req.azuriteRequest = new AzuriteTableRequest({ req: req, payload: req.payload });
            next();
        })
        .delete((req, res, next) => {
            req.azuriteOperation = Operations.DELETE_TABLE;
            req.azuriteRequest = new AzuriteTableRequest({ req: req });
            next();
        });
};