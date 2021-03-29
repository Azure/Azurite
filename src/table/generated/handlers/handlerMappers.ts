import Operation from "../artifacts/operation";

// tslint:disable:one-line

export interface IHandlerPath {
  handler: string;
  method: string;
  arguments: string[];
}

const operationHandlerMapping: {[key: number]: IHandlerPath} = {};

operationHandlerMapping[Operation.Table_Query] = {
  arguments: [
    "options"
  ],
  handler: "tableHandler",
  method: "query"
};
operationHandlerMapping[Operation.Table_Create] = {
  arguments: [
    "tableProperties",
    "options"
  ],
  handler: "tableHandler",
  method: "create"
};
operationHandlerMapping[Operation.Table_Batch] = {
  arguments: [
    "body",
    "multipartContentType",
    "contentLength",
    "options"
  ],
  handler: "tableHandler",
  method: "batch"
};
operationHandlerMapping[Operation.Table_Delete] = {
  arguments: [
    "table",
    "options"
  ],
  handler: "tableHandler",
  method: "delete"
};
operationHandlerMapping[Operation.Table_QueryEntities] = {
  arguments: [
    "table",
    "options"
  ],
  handler: "tableHandler",
  method: "queryEntities"
};
operationHandlerMapping[Operation.Table_QueryEntitiesWithPartitionAndRowKey] = {
  arguments: [
    "table",
    "partitionKey",
    "rowKey",
    "options"
  ],
  handler: "tableHandler",
  method: "queryEntitiesWithPartitionAndRowKey"
};
operationHandlerMapping[Operation.Table_UpdateEntity] = {
  arguments: [
    "table",
    "partitionKey",
    "rowKey",
    "options"
  ],
  handler: "tableHandler",
  method: "updateEntity"
};
operationHandlerMapping[Operation.Table_MergeEntity] = {
  arguments: [
    "table",
    "partitionKey",
    "rowKey",
    "options"
  ],
  handler: "tableHandler",
  method: "mergeEntity"
};
operationHandlerMapping[Operation.Table_DeleteEntity] = {
  arguments: [
    "table",
    "partitionKey",
    "rowKey",
    "ifMatch",
    "options"
  ],
  handler: "tableHandler",
  method: "deleteEntity"
};
operationHandlerMapping[Operation.Table_MergeEntityWithMerge] = {
  arguments: [
    "table",
    "partitionKey",
    "rowKey",
    "options"
  ],
  handler: "tableHandler",
  method: "mergeEntityWithMerge"
};
operationHandlerMapping[Operation.Table_InsertEntity] = {
  arguments: [
    "table",
    "options"
  ],
  handler: "tableHandler",
  method: "insertEntity"
};
operationHandlerMapping[Operation.Table_GetAccessPolicy] = {
  arguments: [
    "table",
    "options"
  ],
  handler: "tableHandler",
  method: "getAccessPolicy"
};
operationHandlerMapping[Operation.Table_SetAccessPolicy] = {
  arguments: [
    "table",
    "options"
  ],
  handler: "tableHandler",
  method: "setAccessPolicy"
};
operationHandlerMapping[Operation.Service_SetProperties] = {
  arguments: [
    "tableServiceProperties",
    "options"
  ],
  handler: "serviceHandler",
  method: "setProperties"
};
operationHandlerMapping[Operation.Service_GetProperties] = {
  arguments: [
    "options"
  ],
  handler: "serviceHandler",
  method: "getProperties"
};
operationHandlerMapping[Operation.Service_GetStatistics] = {
  arguments: [
    "options"
  ],
  handler: "serviceHandler",
  method: "getStatistics"
};
function getHandlerByOperation(operation: Operation): IHandlerPath | undefined {
  return operationHandlerMapping[operation];
}
export default getHandlerByOperation;
