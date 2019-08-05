import Operation from "../artifacts/operation";

// tslint:disable:one-line

export interface IHandlerPath {
  handler: string;
  method: string;
  arguments: string[];
}

const operationHandlerMapping: {[key: number]: IHandlerPath} = {};

operationHandlerMapping[Operation.Service_SetProperties] = {
  arguments: [
    "storageServiceProperties",
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
operationHandlerMapping[Operation.Service_ListQueuesSegment] = {
  arguments: [
    "options"
  ],
  handler: "serviceHandler",
  method: "listQueuesSegment"
};
operationHandlerMapping[Operation.Queue_Create] = {
  arguments: [
    "options"
  ],
  handler: "queueHandler",
  method: "create"
};
operationHandlerMapping[Operation.Queue_Delete] = {
  arguments: [
    "options"
  ],
  handler: "queueHandler",
  method: "delete"
};
operationHandlerMapping[Operation.Queue_GetProperties] = {
  arguments: [
    "options"
  ],
  handler: "queueHandler",
  method: "getProperties"
};
operationHandlerMapping[Operation.Queue_GetPropertiesWithHead] = {
  arguments: [
    "options"
  ],
  handler: "queueHandler",
  method: "getPropertiesWithHead"
};
operationHandlerMapping[Operation.Queue_SetMetadata] = {
  arguments: [
    "options"
  ],
  handler: "queueHandler",
  method: "setMetadata"
};
operationHandlerMapping[Operation.Queue_GetAccessPolicy] = {
  arguments: [
    "options"
  ],
  handler: "queueHandler",
  method: "getAccessPolicy"
};
operationHandlerMapping[Operation.Queue_GetAccessPolicyWithHead] = {
  arguments: [
    "options"
  ],
  handler: "queueHandler",
  method: "getAccessPolicyWithHead"
};
operationHandlerMapping[Operation.Queue_SetAccessPolicy] = {
  arguments: [
    "options"
  ],
  handler: "queueHandler",
  method: "setAccessPolicy"
};
operationHandlerMapping[Operation.Messages_Dequeue] = {
  arguments: [
    "options"
  ],
  handler: "messagesHandler",
  method: "dequeue"
};
operationHandlerMapping[Operation.Messages_Clear] = {
  arguments: [
    "options"
  ],
  handler: "messagesHandler",
  method: "clear"
};
operationHandlerMapping[Operation.Messages_Enqueue] = {
  arguments: [
    "queueMessage",
    "options"
  ],
  handler: "messagesHandler",
  method: "enqueue"
};
operationHandlerMapping[Operation.Messages_Peek] = {
  arguments: [
    "options"
  ],
  handler: "messagesHandler",
  method: "peek"
};
operationHandlerMapping[Operation.MessageId_Update] = {
  arguments: [
    "queueMessage",
    "popReceipt",
    "visibilitytimeout",
    "options"
  ],
  handler: "messageIdHandler",
  method: "update"
};
operationHandlerMapping[Operation.MessageId_Delete] = {
  arguments: [
    "popReceipt",
    "options"
  ],
  handler: "messageIdHandler",
  method: "delete"
};
function getHandlerByOperation(operation: Operation): IHandlerPath | undefined {
  return operationHandlerMapping[operation];
}
export default getHandlerByOperation;
