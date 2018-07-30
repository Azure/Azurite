import * as  BbPromise from "bluebird";
import AzuriteError from "../../core/AzuriteError";
import { Operations } from "../../core/Constants";
import ErrorCodes from "../../core/ErrorCodes";
import N from "../../core/HttpHeaderNames";
import TableStorageManager from "../../core/table/TableStorageManager";
import ConflictingEntity from "../../validation/table/ConflictingEntity";
import ConflictingTable from "../../validation/table/ConflictingTable";
import EntityExists from "../../validation/table/EntityExists";
import EntityIfMatch from "../../validation/table/EntityIfMatch";
import TableExists from "../../validation/table/TableExists";
import TableName from "../../validation/table/TableName";
import ValidationContext from "../../validation/table/ValidationContext";

export default (req, res, next) => {
  BbPromise.try(() => {
    // Azurite currently does not support XML-Atom responses, only supports JSON-based responses.
    if (req.headers[N.CONTENT_TYPE] === `application/atom+xml`) {
      throw new AzuriteError(ErrorCodes.AtomXmlNotSupported);
    }
    const request = req.azuriteRequest;
    const tableProxy = TableStorageManager._getTable(request.tableName);
    const entityProxy = TableStorageManager._getEntity(
      request.tableName,
      request.partitionKey,
      request.rowKey
    );
    const validationContext = new ValidationContext({
      entity: entityProxy,
      request,
      table: tableProxy
    });
    validations[req.azuriteOperation](validationContext);
    next();
  }).catch(e => {
    // in order to avoid PANIC and better support Azure Storage Explorer
    // sending not implemented instead of server error
    res.status(e.statusCode || 501).send(e.message);
  });
};

const validations = {};

validations[Operations.Table.CREATE_TABLE] = valContext => {
  valContext.run(ConflictingTable).run(TableName);
};

validations[Operations.Table.INSERT_ENTITY] = valContext => {
  valContext.run(TableExists).run(ConflictingEntity);
};

validations[Operations.Table.DELETE_TABLE] = valContext => {
  valContext.run(TableExists);
};

validations[Operations.Table.DELETE_ENTITY] = valContext => {
  valContext
    .run(TableExists)
    .run(EntityExists)
    .run(EntityIfMatch);
};

validations[Operations.Table.QUERY_TABLE] = valContext => {
  valContext.run(TableExists);
};

validations[Operations.Table.QUERY_ENTITY] = valContext => {
  valContext.run(TableExists);
};

validations[Operations.Table.UPDATE_ENTITY] = valContext => {
  valContext
    .run(TableExists)
    .run(EntityExists)
    .run(EntityIfMatch);
};

validations[Operations.Table.INSERT_OR_REPLACE_ENTITY] = valContext => {
  valContext.run(TableExists);
};

validations[Operations.Table.MERGE_ENTITY] = valContext => {
  valContext
    .run(TableExists)
    .run(EntityExists)
    .run(EntityIfMatch);
};

validations[Operations.Table.INSERT_OR_MERGE_ENTITY] = valContext => {
  valContext.run(TableExists);
};
