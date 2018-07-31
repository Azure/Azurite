export const StorageTables = {
  Commits: "Commmits",
  Containers: "Containers",
  Pages: "Pages",
  ServiceProperties: "ServiceProperties"
};

export const TableStorageTables = {
  Tables: "Tables"
};

export const StorageEntityType = {
  AppendBlob: "AppendBlob",
  BlockBlob: "BlockBlob",
  Container: "Container",
  PageBlob: "PageBlob"
};

export const Usage = {
  Read: 1,
  Write: 2,
  // tslint:disable-next-line:object-literal-sort-keys
  Delete: 4,
  Other: 8
};

export const LeaseStatus = {
  AVAILABLE: "available",
  BROKEN: "broken",
  // tslint:disable-next-line:object-literal-sort-keys
  BREAKING: "breaking",
  LEASED: "leased",
  EXPIRED: "expired"
};

export const LeaseActions = {
  ACQUIRE: "acquire",
  RENEW: "renew",
  // tslint:disable-next-line:object-literal-sort-keys
  CHANGE: "change",
  RELEASE: "release",
  BREAK: "break"
};

export const BlockListType = {
  ALL: "all",
  COMMITTED: "committed",
  UNCOMMITTED: "uncommitted"
};

export const Operations = {
  Account: {
    GET_BLOB_SERVICE_PROPERTIES: "GetBlobServiceProperties",
    LIST_CONTAINERS: "ListContainers",
    PREFLIGHT_BLOB_REQUEST: "PreflightBlobRequest",
    SET_BLOB_SERVICE_PROPERTIES: "SetBlobServiceProperties"
  },
  Blob: {
    ABORT_COPY_BLOB: "AbortCopyBlob",
    APPEND_BLOCK: "AppendBlock",
    COPY_BLOB: "CopyBlob",
    DELETE_BLOB: "DeleteBlob",
    GET_BLOB: "GetBlob",
    GET_BLOB_METADATA: "GetBlobMetadata",
    GET_BLOB_PROPERTIES: "GetBlobProperties",
    GET_BLOCK_LIST: "GetBlockList",
    GET_PAGE_RANGES: "GetPageRanges",
    INCREMENTAL_COPY_BLOB: "IncrementalCopyBlob",
    LEASE_BLOB: "LeaseBlob",
    PUT_BLOB: "PutBlob",
    PUT_BLOCK: "PutBlock",
    PUT_BLOCK_LIST: "PutBlockList",
    PUT_PAGE: "PutPage",
    SET_BLOB_METADATA: "SetBlobMetadata",
    SET_BLOB_PROPERTIES: "SetBlobProperties",
    SET_BLOB_TIER: "SetBlobTier",
    SNAPSHOT_BLOB: "SnapshotBlob"
  },
  Container: {
    CREATE_CONTAINER: "CreateContainer",
    DELETE_CONTAINER: "DeleteContainer",
    GET_CONTAINER_ACL: "GetContainerAcl",
    GET_CONTAINER_METADATA: "GetContainerMetadata",
    GET_CONTAINER_PROPERTIES: "GetContainerProperties",
    LEASE_CONTAINER: "LeaseContainer",
    LIST_BLOBS: "ListBlobs",
    SET_CONTAINER_ACL: "SetContainerAcl",
    SET_CONTAINER_METADATA: "SetContainerMetadata"
  },
  Queue: {
    CLEAR_MESSAGES: "ClearMessages",
    CREATE_QUEUE: "CreateQueue",
    DELETE_MESSAGE: "DeleteMessage",
    DELETE_QUEUE: "DeleteQueue",
    GET_MESSAGE: "GetMessage",
    GET_QUEUE_ACL: "GetQueueAcl",
    GET_QUEUE_METADATA: "GetQueueMetadata",
    LIST_QUEUES: "ListQueues",
    PEEK_MESSAGES: "PeekMessages",
    PUT_MESSAGE: "PutMessage",
    SET_QUEUE_ACL: "SetQueueAcl",
    SET_QUEUE_METADATA: "SetQueueMetadata",
    UPDATE_MESSAGE: "UpdateMessage"
  },
  Table: {
    CREATE_TABLE: "CreateTable",
    DELETE_ENTITY: "DeleteEntity",
    DELETE_TABLE: "DeleteTable",
    INSERT_ENTITY: "InsertEntity",
    INSERT_OR_MERGE_ENTITY: "InsertOrMergeEntity",
    INSERT_OR_REPLACE_ENTITY: "InsertOrReplaceEntity",
    MERGE_ENTITY: "MergeEntity",
    QUERY_ENTITY: "QueryEntity",
    QUERY_TABLE: "QueryTable",
    UPDATE_ENTITY: "UpdateEntity"
  },
  Undefined: "Undefined"
};

export const CopyStatus = {
  PENDING: "pending",
  SUCCESS: "success",
  // tslint:disable-next-line:object-literal-sort-keys
  FAILED: "failed",
  ABORTED: "aborted"
};

// See allowed operations below in comments
export const ServiceSAS = {
  Blob: {
    // Add a block to any append blob in the container.
    ADD: "a",
    // Write a new blob to the container, snapshot any blob in the container, or copy a blob to a new blob in the container.
    CREATE: "c",
    // Delete any blob in the container. Note: You cannot grant permissions to delete a container with a service SAS. Use an account SAS instead.
    DELETE: "d",
    // Read the content, properties, metadata or block list of any blob in the container. Use any blob in the container as the source of a copy operation.
    // List blobs in the container.
    LIST: "l",
    READ: "r",
    // For any blob in the container, create or write content, properties, metadata, or block list. Snapshot or lease the blob.
    // Resize the blob (page blob only). Use the blob as the destination of a copy operation. Note: You cannot grant permissions
    // to read or write container properties or metadata, nor to lease a container, with a service SAS. Use an account SAS instead.
    WRITE: "w"
  }
};

export const _key = `Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==`;
export const Keys = {
  AccessKey: _key,
  DecodedAccessKey: Buffer.from(_key, "base64")
};

export const ODataMode = {
  NONE: "nometadata",
  // tslint:disable-next-line:object-literal-sort-keys
  MINIMAL: "minimalmetadata",
  FULL: "fullmetadata"
};
