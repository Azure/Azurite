'use strict';

import env from './../../core/env';
import AzuriteTableRequest from './../../model/table/AzuriteTableRequest';
import N from './../../core/HttpHeaderNames';

const Operations = require('./../../core/Constants').Operations.Table;

/*
 * Route definitions for all operation on the 'message' resource type.
 * See https://docs.microsoft.com/rest/api/storageservices/operations-on-entities
 * for details on specification.
 */
export default (app) => {
    app.route(new RegExp(`\/${env.emulatedStorageAccountName}\/([A-Za-z0-9]+)(.*)`))
        .get((req, res, next) => {
            if (req.azuriteOperation === undefined) {
                req.azuriteOperation = Operations.QUERY_ENTITY;
                req.azuriteRequest = new AzuriteTableRequest({ req: req });
            }
            next();
        })
        .head((req, res, next) => {
            next();
        })
        .put((req, res, next) => {
            if (req.azuriteOperation === undefined) {
                req.azuriteRequest = new AzuriteTableRequest({ req: req, payload: req.payload });
                req.azuriteOperation = req.azuriteRequest.httpProps[N.IF_MATCH]
                    ? Operations.UPDATE_ENTITY
                    : Operations.INSERT_OR_REPLACE_ENTITY;
            }
            next();
        })
        .post((req, res, next) => {
            if (req.azuriteOperation === undefined) {
                req.azuriteOperation = Operations.INSERT_ENTITY
                req.azuriteRequest = new AzuriteTableRequest({ req: req, payload: req.payload });
            }
            next();
        })
        .delete((req, res, next) => {
            req.azuriteOperation = Operations.DELETE_ENTITY;
            req.azuriteRequest = new AzuriteTableRequest({ req: req });
            next();
        })
        .merge((req, res, next) => {
            req.azuriteRequest = new AzuriteTableRequest({ req: req, payload: req.payload });
            req.azuriteOperation = req.azuriteRequest.httpProps[N.IF_MATCH]
                ? Operations.MERGE_ENTITY
                : Operations.INSERT_OR_MERGE_ENTITY;
            next();
        });
};