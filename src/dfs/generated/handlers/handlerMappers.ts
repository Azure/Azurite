import Operation from "../artifacts/operation";

// tslint:disable:one-line

export interface IHandlerPath {
  handler: string;
  method: string;
  arguments: string[];
}

const operationHandlerMapping: {[key: number]: IHandlerPath} = {};

operationHandlerMapping[Operation.Service_ListFileSystems] = {
  arguments: [
    "options"
  ],
  handler: "serviceHandler",
  method: "listFileSystems"
};
operationHandlerMapping[Operation.FileSystem_Create] = {
  arguments: [
    "options"
  ],
  handler: "fileSystemOperationsHandler",
  method: "create"
};
operationHandlerMapping[Operation.FileSystem_SetProperties] = {
  arguments: [
    "options"
  ],
  handler: "fileSystemOperationsHandler",
  method: "setProperties"
};
operationHandlerMapping[Operation.FileSystem_GetProperties] = {
  arguments: [
    "options"
  ],
  handler: "fileSystemOperationsHandler",
  method: "getProperties"
};
operationHandlerMapping[Operation.FileSystem_Delete] = {
  arguments: [
    "options"
  ],
  handler: "fileSystemOperationsHandler",
  method: "delete"
};
operationHandlerMapping[Operation.FileSystem_ListPaths] = {
  arguments: [
    "recursive",
    "options"
  ],
  handler: "fileSystemOperationsHandler",
  method: "listPaths"
};
operationHandlerMapping[Operation.FileSystem_ListBlobHierarchySegment] = {
  arguments: [
    "options"
  ],
  handler: "fileSystemOperationsHandler",
  method: "listBlobHierarchySegment"
};
operationHandlerMapping[Operation.Path_Create] = {
  arguments: [
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "create"
};
operationHandlerMapping[Operation.Path_Update] = {
  arguments: [
    "action",
    "mode",
    "body",
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "update"
};
operationHandlerMapping[Operation.Path_Lease] = {
  arguments: [
    "xMsLeaseAction",
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "lease"
};
operationHandlerMapping[Operation.Path_Read] = {
  arguments: [
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "read"
};
operationHandlerMapping[Operation.Path_GetProperties] = {
  arguments: [
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "getProperties"
};
operationHandlerMapping[Operation.Path_Delete] = {
  arguments: [
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "delete"
};
operationHandlerMapping[Operation.Path_SetAccessControl] = {
  arguments: [
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "setAccessControl"
};
operationHandlerMapping[Operation.Path_SetAccessControlRecursive] = {
  arguments: [
    "mode",
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "setAccessControlRecursive"
};
operationHandlerMapping[Operation.Path_FlushData] = {
  arguments: [
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "flushData"
};
operationHandlerMapping[Operation.Path_AppendData] = {
  arguments: [
    "body",
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "appendData"
};
operationHandlerMapping[Operation.Path_SetExpiry] = {
  arguments: [
    "expiryOptions",
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "setExpiry"
};
operationHandlerMapping[Operation.Path_Undelete] = {
  arguments: [
    "options"
  ],
  handler: "pathOperationsHandler",
  method: "undelete"
};
function getHandlerByOperation(operation: Operation): IHandlerPath | undefined {
  return operationHandlerMapping[operation];
}
export default getHandlerByOperation;
