import Operation from "../artifacts/operation";

// tslint:disable:one-line

export interface IHandlerPath {
  handler: string;
  method: string;
  arguments: string[];
}

const operationHandlerMapping: { [key: number]: IHandlerPath } = {};

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
operationHandlerMapping[Operation.Service_ListContainersSegment] = {
  arguments: [
    "options"
  ],
  handler: "serviceHandler",
  method: "listContainersSegment"
};
operationHandlerMapping[Operation.Service_GetUserDelegationKey] = {
  arguments: [
    "keyInfo",
    "options"
  ],
  handler: "serviceHandler",
  method: "getUserDelegationKey"
};
operationHandlerMapping[Operation.Service_GetAccountInfo] = {
  arguments: [],
  handler: "serviceHandler",
  method: "getAccountInfo"
};
operationHandlerMapping[Operation.Service_GetAccountInfoWithHead] = {
  arguments: [],
  handler: "serviceHandler",
  method: "getAccountInfo"
};
operationHandlerMapping[Operation.Service_SubmitBatch] = {
  arguments: [
    "body",
    "contentLength",
    "multipartContentType",
    "options"
  ],
  handler: "serviceHandler",
  method: "submitBatch"
};
operationHandlerMapping[Operation.Service_FilterBlobs] = {
  arguments: [
    "options"
  ],
  handler: "serviceHandler",
  method: "filterBlobs"
};
operationHandlerMapping[Operation.Container_Create] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "create"
};
operationHandlerMapping[Operation.Container_GetProperties] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "getProperties"
};
operationHandlerMapping[Operation.Container_GetPropertiesWithHead] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "getProperties"
};
operationHandlerMapping[Operation.Container_Delete] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "delete"
};
operationHandlerMapping[Operation.Container_SetMetadata] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "setMetadata"
};
operationHandlerMapping[Operation.Container_GetAccessPolicy] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "getAccessPolicy"
};
operationHandlerMapping[Operation.Container_SetAccessPolicy] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "setAccessPolicy"
};
operationHandlerMapping[Operation.Container_Restore] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "restore"
};
operationHandlerMapping[Operation.Container_SubmitBatch] = {
  arguments: [
    "body",
    "contentLength",
    "multipartContentType",
    "options"
  ],
  handler: "containerHandler",
  method: "submitBatch"
};
operationHandlerMapping[Operation.Container_FilterBlobs] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "filterBlobs"
};
operationHandlerMapping[Operation.Container_AcquireLease] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "acquireLease"
};
operationHandlerMapping[Operation.Container_ReleaseLease] = {
  arguments: [
    "leaseId",
    "options"
  ],
  handler: "containerHandler",
  method: "releaseLease"
};
operationHandlerMapping[Operation.Container_RenewLease] = {
  arguments: [
    "leaseId",
    "options"
  ],
  handler: "containerHandler",
  method: "renewLease"
};
operationHandlerMapping[Operation.Container_BreakLease] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "breakLease"
};
operationHandlerMapping[Operation.Container_ChangeLease] = {
  arguments: [
    "leaseId",
    "proposedLeaseId",
    "options"
  ],
  handler: "containerHandler",
  method: "changeLease"
};
operationHandlerMapping[Operation.Container_ListBlobFlatSegment] = {
  arguments: [
    "options"
  ],
  handler: "containerHandler",
  method: "listBlobFlatSegment"
};
operationHandlerMapping[Operation.Container_ListBlobHierarchySegment] = {
  arguments: [
    "delimiter",
    "options"
  ],
  handler: "containerHandler",
  method: "listBlobHierarchySegment"
};
operationHandlerMapping[Operation.Container_GetAccountInfo] = {
  arguments: [
  ],
  handler: "containerHandler",
  method: "getAccountInfo"
};
operationHandlerMapping[Operation.Container_GetAccountInfoWithHead] = {
  arguments: [
  ],
  handler: "containerHandler",
  method: "getAccountInfo"
};
operationHandlerMapping[Operation.Blob_Download] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "download"
};
operationHandlerMapping[Operation.Blob_GetProperties] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "getProperties"
};
operationHandlerMapping[Operation.Blob_Delete] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "delete"
};
operationHandlerMapping[Operation.Blob_Undelete] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "undelete"
};
operationHandlerMapping[Operation.Blob_SetExpiry] = {
  arguments: [
    "expiryOptions",
    "options"
  ],
  handler: "blobHandler",
  method: "setExpiry"
};
operationHandlerMapping[Operation.Blob_SetHTTPHeaders] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "setHTTPHeaders"
};
operationHandlerMapping[Operation.Blob_SetImmutabilityPolicy] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "setImmutabilityPolicy"
};
operationHandlerMapping[Operation.Blob_DeleteImmutabilityPolicy] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "deleteImmutabilityPolicy"
};
operationHandlerMapping[Operation.Blob_SetLegalHold] = {
  arguments: [
    "legalHold",
    "options"
  ],
  handler: "blobHandler",
  method: "setLegalHold"
};
operationHandlerMapping[Operation.Blob_SetMetadata] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "setMetadata"
};
operationHandlerMapping[Operation.Blob_AcquireLease] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "acquireLease"
};
operationHandlerMapping[Operation.Blob_ReleaseLease] = {
  arguments: [
    "leaseId",
    "options"
  ],
  handler: "blobHandler",
  method: "releaseLease"
};
operationHandlerMapping[Operation.Blob_RenewLease] = {
  arguments: [
    "leaseId",
    "options"
  ],
  handler: "blobHandler",
  method: "renewLease"
};
operationHandlerMapping[Operation.Blob_ChangeLease] = {
  arguments: [
    "leaseId",
    "proposedLeaseId",
    "options"
  ],
  handler: "blobHandler",
  method: "changeLease"
};
operationHandlerMapping[Operation.Blob_BreakLease] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "breakLease"
};
operationHandlerMapping[Operation.Blob_CreateSnapshot] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "createSnapshot"
};
operationHandlerMapping[Operation.Blob_StartCopyFromURL] = {
  arguments: [
    "copySource",
    "options"
  ],
  handler: "blobHandler",
  method: "startCopyFromURL"
};
operationHandlerMapping[Operation.Blob_CopyFromURL] = {
  arguments: [
    "copySource",
    "options"
  ],
  handler: "blobHandler",
  method: "copyFromURL"
};
operationHandlerMapping[Operation.Blob_AbortCopyFromURL] = {
  arguments: [
    "copyId",
    "options"
  ],
  handler: "blobHandler",
  method: "abortCopyFromURL"
};
operationHandlerMapping[Operation.Blob_SetTier] = {
  arguments: [
    "tier",
    "options"
  ],
  handler: "blobHandler",
  method: "setTier"
};
operationHandlerMapping[Operation.Blob_GetAccountInfo] = {
  arguments: [
  ],
  handler: "blobHandler",
  method: "getAccountInfo"
};
operationHandlerMapping[Operation.Blob_GetAccountInfoWithHead] = {
  arguments: [
  ],
  handler: "blobHandler",
  method: "getAccountInfo"
};
operationHandlerMapping[Operation.Blob_Query] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "query"
};
operationHandlerMapping[Operation.Blob_GetTags] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "getTags"
};
operationHandlerMapping[Operation.Blob_SetTags] = {
  arguments: [
    "options"
  ],
  handler: "blobHandler",
  method: "setTags"
};
operationHandlerMapping[Operation.PageBlob_Create] = {
  arguments: [
    "contentLength",
    "blobContentLength",
    "options"
  ],
  handler: "pageBlobHandler",
  method: "create"
};
operationHandlerMapping[Operation.PageBlob_UploadPages] = {
  arguments: [
    "body",
    "contentLength",
    "options"
  ],
  handler: "pageBlobHandler",
  method: "uploadPages"
};
operationHandlerMapping[Operation.PageBlob_ClearPages] = {
  arguments: [
    "contentLength",
    "options"
  ],
  handler: "pageBlobHandler",
  method: "clearPages"
};
operationHandlerMapping[Operation.PageBlob_UploadPagesFromURL] = {
  arguments: [
    "sourceUrl",
    "sourceRange",
    "contentLength",
    "range",
    "options"
  ],
  handler: "pageBlobHandler",
  method: "uploadPagesFromURL"
};
operationHandlerMapping[Operation.PageBlob_GetPageRanges] = {
  arguments: [
    "options"
  ],
  handler: "pageBlobHandler",
  method: "getPageRanges"
};
operationHandlerMapping[Operation.PageBlob_GetPageRangesDiff] = {
  arguments: [
    "options"
  ],
  handler: "pageBlobHandler",
  method: "getPageRangesDiff"
};
operationHandlerMapping[Operation.PageBlob_Resize] = {
  arguments: [
    "blobContentLength",
    "options"
  ],
  handler: "pageBlobHandler",
  method: "resize"
};
operationHandlerMapping[Operation.PageBlob_UpdateSequenceNumber] = {
  arguments: [
    "sequenceNumberAction",
    "options"
  ],
  handler: "pageBlobHandler",
  method: "updateSequenceNumber"
};
operationHandlerMapping[Operation.PageBlob_CopyIncremental] = {
  arguments: [
    "copySource",
    "options"
  ],
  handler: "pageBlobHandler",
  method: "copyIncremental"
};
operationHandlerMapping[Operation.AppendBlob_Create] = {
  arguments: [
    "contentLength",
    "options"
  ],
  handler: "appendBlobHandler",
  method: "create"
};
operationHandlerMapping[Operation.AppendBlob_AppendBlock] = {
  arguments: [
    "body",
    "contentLength",
    "options"
  ],
  handler: "appendBlobHandler",
  method: "appendBlock"
};
operationHandlerMapping[Operation.AppendBlob_AppendBlockFromUrl] = {
  arguments: [
    "sourceUrl",
    "contentLength",
    "options"
  ],
  handler: "appendBlobHandler",
  method: "appendBlockFromUrl"
};
operationHandlerMapping[Operation.AppendBlob_Seal] = {
  arguments: [
    "options"
  ],
  handler: "appendBlobHandler",
  method: "seal"
};
operationHandlerMapping[Operation.BlockBlob_Upload] = {
  arguments: [
    "body",
    "contentLength",
    "options"
  ],
  handler: "blockBlobHandler",
  method: "upload"
};
operationHandlerMapping[Operation.BlockBlob_PutBlobFromUrl] = {
  arguments: [
    "contentLength",
    "copySource",
    "options"
  ],
  handler: "blockBlobHandler",
  method: "putBlobFromUrl"
};
operationHandlerMapping[Operation.BlockBlob_StageBlock] = {
  arguments: [
    "blockId",
    "contentLength",
    "body",
    "options"
  ],
  handler: "blockBlobHandler",
  method: "stageBlock"
};
operationHandlerMapping[Operation.BlockBlob_StageBlockFromURL] = {
  arguments: [
    "blockId",
    "contentLength",
    "sourceUrl",
    "options"
  ],
  handler: "blockBlobHandler",
  method: "stageBlockFromURL"
};
operationHandlerMapping[Operation.BlockBlob_CommitBlockList] = {
  arguments: [
    "blocks",
    "options"
  ],
  handler: "blockBlobHandler",
  method: "commitBlockList"
};
operationHandlerMapping[Operation.BlockBlob_GetBlockList] = {
  arguments: [
    "options"
  ],
  handler: "blockBlobHandler",
  method: "getBlockList"
};
function getHandlerByOperation(operation: Operation): IHandlerPath | undefined {
  return operationHandlerMapping[operation];
}
export default getHandlerByOperation;
