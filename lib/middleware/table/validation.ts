const BbPromise = from "bluebird"),
  N = from "./../../core/HttpHeaderNames"),
  AError = from "./../../core/AzuriteError"),
  ErrorCodes = from "./../../core/ErrorCodes"),
  Operations = from "./../../core/Constants").Operations.Table,
  tsm = from "./../../core/table/TableStorageManager"),
  ValidationContext = from "./../../validation/table/ValidationContext"),
  TableExistsVal = from "./../../validation/table/TableExists"),
  ConflictingEntityVal = from "./../../validation/table/ConflictingEntity"),
  TableNameVal = from "./../../validation/table/TableName"),
  EntityExistsVal = from "./../../validation/table/EntityExists"),
  EntityIfMatchVal = from "./../../validation/table/EntityIfMatch"),
  ConflictingTableVal = from "./../../validation/table/ConflictingTable");

export default (req, res, next) => {
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
        request,
        table: tableProxy,
        entity: entityProxy
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

validations[undefined] = () => {
  // NO VALIDATIONS (this is an unimplemented call)
};

validations[Operations.CREATE_TABLE] = valContext => {
  valContext.run(ConflictingTableVal).run(TableNameVal);
};

validations[Operations.INSERT_ENTITY] = valContext => {
  valContext.run(TableExistsVal).run(ConflictingEntityVal);
};

validations[Operations.DELETE_TABLE] = valContext => {
  valContext.run(TableExistsVal);
};

validations[Operations.DELETE_ENTITY] = valContext => {
  valContext
    .run(TableExistsVal)
    .run(EntityExistsVal)
    .run(EntityIfMatchVal);
};

validations[Operations.QUERY_TABLE] = valContext => {
  valContext.run(TableExistsVal);
};

validations[Operations.QUERY_ENTITY] = valContext => {
  valContext.run(TableExistsVal);
};

validations[Operations.UPDATE_ENTITY] = valContext => {
  valContext
    .run(TableExistsVal)
    .run(EntityExistsVal)
    .run(EntityIfMatchVal);
};

validations[Operations.INSERT_OR_REPLACE_ENTITY] = valContext => {
  valContext.run(TableExistsVal);
};

validations[Operations.MERGE_ENTITY] = valContext => {
  valContext
    .run(TableExistsVal)
    .run(EntityExistsVal)
    .run(EntityIfMatchVal);
};

validations[Operations.INSERT_OR_MERGE_ENTITY] = valContext => {
  valContext.run(TableExistsVal);
};
