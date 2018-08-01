'use strict';

import BbPromise from 'bluebird';
import N from './../../core/HttpHeaderNames';
import AError from './../../core/AzuriteError';
import ErrorCodes from './../../core/ErrorCodes';
import tsm from './../../core/table/TableStorageManager';
import ValidationContext from './../../validation/table/ValidationContext';
import TableExistsVal from './../../validation/table/TableExists';
import ConflictingEntityVal from './../../validation/table/ConflictingEntity';
import TableNameVal from './../../validation/table/TableName';
import EntityExistsVal from './../../validation/table/EntityExists';
import EntityIfMatchVal from './../../validation/table/EntityIfMatch';
import ConflictingTableVal from './../../validation/table/ConflictingTable';

const Operations = require('./../../core/Constants').Operations.Table;

export default (req, res, next) => {
    BbPromise.try(() => {
        // Azurite currently does not support XML-Atom responses, only supports JSON-based responses.
        if (req.headers[N.CONTENT_TYPE] === `application/atom+xml`) {
            throw new AError(ErrorCodes.AtomXmlNotSupported);
        }
        const request = req.azuriteRequest,
            tableProxy = tsm._getTable(request.tableName),
            entityProxy = tsm._getEntity(request.tableName, request.partitionKey, request.rowKey),
            validationContext = new ValidationContext({
                request: request,
                table: tableProxy,
                entity: entityProxy
            });
        validations[req.azuriteOperation](validationContext);
        next();
    }).catch((e) => {
        // in order to avoid PANIC and better support Azure Storage Explorer
        // sending not implemented instead of server error
        res.status(e.statusCode || 501).send(e.message);
    });
};

const validations = {};

validations[undefined] = () => {
    // NO VALIDATIONS (this is an unimplemented call)
}

validations[Operations.CREATE_TABLE] = (valContext) => {
    valContext
        .run(ConflictingTableVal)
        .run(TableNameVal);
}

validations[Operations.INSERT_ENTITY] = (valContext) => {
    valContext
        .run(TableExistsVal)
        .run(ConflictingEntityVal);
}

validations[Operations.DELETE_TABLE] = (valContext) => {
    valContext
        .run(TableExistsVal);
}

validations[Operations.DELETE_ENTITY] = (valContext) => {
    valContext
        .run(TableExistsVal)
        .run(EntityExistsVal)
        .run(EntityIfMatchVal);
}

validations[Operations.QUERY_TABLE] = (valContext) => {
    valContext
        .run(TableExistsVal)
}

validations[Operations.QUERY_ENTITY] = (valContext) => {
    valContext
        .run(TableExistsVal)
}

validations[Operations.UPDATE_ENTITY] = (valContext) => {
    valContext
        .run(TableExistsVal)
        .run(EntityExistsVal)
        .run(EntityIfMatchVal);
}

validations[Operations.INSERT_OR_REPLACE_ENTITY] = (valContext) => {
    valContext
        .run(TableExistsVal);
}

validations[Operations.MERGE_ENTITY] = (valContext) => {
    valContext
        .run(TableExistsVal)
        .run(EntityExistsVal)
        .run(EntityIfMatchVal);
}

validations[Operations.INSERT_OR_MERGE_ENTITY] = (valContext) => {
    valContext
        .run(TableExistsVal);
}