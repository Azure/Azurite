/** @format */

"use strict";

const BbPromise = require("bluebird"),
  N = require("./../../core/HttpHeaderNames"),
  AError = require("./../../core/AzuriteError"),
  ErrorCodes = require("./../../core/ErrorCodes"),
  Operations = require("./../../core/Constants").Operations.Table,
  tsm = require("./../../core/table/TableStorageManager"),
  ValidationContext = require("./../../validation/table/ValidationContext"),
  TableExistsVal = require("./../../validation/table/TableExists"),
  ConflictingEntityVal = require("./../../validation/table/ConflictingEntity"),
  TableNameVal = require("./../../validation/table/TableName"),
  EntityExistsVal = require("./../../validation/table/EntityExists"),
  EntityIfMatchVal = require("./../../validation/table/EntityIfMatch"),
  ConflictingTableVal = require("./../../validation/table/ConflictingTable");

module.exports = (req, res, next) => {
  BbPromise.try(() => {
    // Azurite currently does not support XML-Atom responses, only supports JSON-based responses.
    if (req.headers[N.CONTENT_TYPE] === `application/atom+xml`) {
      throw new AError(ErrorCodes.AtomXmlNotSupported);
    }
    const request = req.azuriteRequest,
      tableProxy = tsm._getTable(request.tableName),
      entityProxy = tsm._getEntity(
        request.tableName,
        request.partitionKey,
        request.rowKey
      ),
      validationContext = new ValidationContext({
        request: request,
        table: tableProxy,
        entity: entityProxy,
      });
    validations[req.azuriteOperation](validationContext);
    next();
  }).catch((e) => {
    // in order to avoid PANIC and better support Azure Storage Explorer
    // sending not implemented instead of server error
    if (e instanceof AError) { e.send(res); } else { res.status(e.statusCode || 501).send(e.message); }
  });
};

const validations = {};

validations[undefined] = () => {
  // NO VALIDATIONS (this is an unimplemented call)
};

validations[Operations.CREATE_TABLE] = (valContext) => {
  valContext.run(ConflictingTableVal).run(TableNameVal);
};

validations[Operations.INSERT_ENTITY] = (valContext) => {
  valContext.run(TableExistsVal).run(ConflictingEntityVal);
};

validations[Operations.DELETE_TABLE] = (valContext) => {
  valContext.run(TableExistsVal);
};

validations[Operations.DELETE_ENTITY] = (valContext) => {
  valContext
    .run(TableExistsVal)
    .run(EntityExistsVal)
    .run(EntityIfMatchVal);
};

validations[Operations.QUERY_TABLE] = (valContext) => {
  valContext.run(TableExistsVal);
};

validations[Operations.QUERY_ENTITY] = (valContext) => {
  valContext.run(TableExistsVal);
};

validations[Operations.UPDATE_ENTITY] = (valContext) => {
  valContext
    .run(TableExistsVal)
    .run(EntityExistsVal)
    .run(EntityIfMatchVal);
};

validations[Operations.INSERT_OR_REPLACE_ENTITY] = (valContext) => {
  valContext.run(TableExistsVal);
};

validations[Operations.MERGE_ENTITY] = (valContext) => {
  valContext
    .run(TableExistsVal)
    .run(EntityExistsVal)
    .run(EntityIfMatchVal);
};

validations[Operations.INSERT_OR_MERGE_ENTITY] = (valContext) => {
  valContext.run(TableExistsVal);
};
