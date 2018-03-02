'use strict';

const StorageTables = {
    Containers: 'Containers',
    Commits: 'Commmits',
    Pages: 'Pages',
    ServiceProperties: 'ServiceProperties'
}

const TableStorageTables = {
    Tables: 'Tables'
}

const StorageEntityType = {
    Container: 'Container',
    BlockBlob: 'BlockBlob',
    AppendBlob: 'AppendBlob',
    PageBlob: 'PageBlob'
}

const Usage = {
    Read: 1,
    Write: 2,
    Delete: 4,
    Other: 8
}

const LeaseStatus = {
    AVAILABLE: 'available',
    BROKEN: 'broken',
    BREAKING: 'breaking',
    LEASED: 'leased',
    EXPIRED: 'expired'
}

const LeaseActions = {
    ACQUIRE: 'acquire',
    RENEW: 'renew',
    CHANGE: 'change',
    RELEASE: 'release',
    BREAK: 'break'
}

const BlockListType = {
    COMMITTED: 'committed',
    UNCOMMITTED: 'uncommitted',
    ALL: 'all'
}

const Operations = {
    Undefined: 'Undefined',
    Account: {
        LIST_CONTAINERS: 'ListContainers',
        SET_BLOB_SERVICE_PROPERTIES: 'SetBlobServiceProperties',
        GET_BLOB_SERVICE_PROPERTIES: 'GetBlobServiceProperties',
        PREFLIGHT_BLOB_REQUEST: 'PreflightBlobRequest'
    },
    Container: {
        CREATE_CONTAINER: 'CreateContainer',
        GET_CONTAINER_PROPERTIES: 'GetContainerProperties',
        GET_CONTAINER_METADATA: 'GetContainerMetadata',
        SET_CONTAINER_METADATA: 'SetContainerMetadata',
        GET_CONTAINER_ACL: 'GetContainerAcl',
        SET_CONTAINER_ACL: 'SetContainerAcl',
        DELETE_CONTAINER: 'DeleteContainer',
        LEASE_CONTAINER: 'LeaseContainer',
        LIST_BLOBS: 'ListBlobs'
    },
    Blob: {
        PUT_BLOB: 'PutBlob',
        GET_BLOB: 'GetBlob',
        GET_BLOB_PROPERTIES: 'GetBlobProperties',
        SET_BLOB_PROPERTIES: 'SetBlobProperties',
        GET_BLOB_METADATA: 'GetBlobMetadata',
        SET_BLOB_METADATA: 'SetBlobMetadata',
        LEASE_BLOB: 'LeaseBlob',
        SNAPSHOT_BLOB: 'SnapshotBlob',
        COPY_BLOB: 'CopyBlob',
        ABORT_COPY_BLOB: 'AbortCopyBlob',
        DELETE_BLOB: 'DeleteBlob',
        SET_BLOB_TIER: 'SetBlobTier',
        PUT_BLOCK: 'PutBlock',
        PUT_BLOCK_LIST: 'PutBlockList',
        GET_BLOCK_LIST: 'GetBlockList',
        PUT_PAGE: 'PutPage',
        GET_PAGE_RANGES: 'GetPageRanges',
        INCREMENTAL_COPY_BLOB: 'IncrementalCopyBlob',
        APPEND_BLOCK: 'AppendBlock',
        COPY_BLOB: 'CopyBlob',
        ABORT_COPY_BLOB: 'AbortCopyBlob'
    },
    Queue: {
        CREATE_QUEUE: 'CreateQueue',
        DELETE_QUEUE: 'DeleteQueue',
        SET_QUEUE_METADATA: 'SetQueueMetadata',
        GET_QUEUE_METADATA: 'GetQueueMetadata',
        PUT_MESSAGE: 'PutMessage',
        GET_MESSAGE: 'GetMessage',
        CLEAR_MESSAGES: 'ClearMessages',
        PEEK_MESSAGES: 'PeekMessages',
        DELETE_MESSAGE: 'DeleteMessage',
        UPDATE_MESSAGE: 'UpdateMessage',
        LIST_QUEUES: 'ListQueues',
        SET_QUEUE_ACL: 'SetQueueAcl',
        GET_QUEUE_ACL: 'GetQueueAcl'
    },
    Table: {
        CREATE_TABLE: 'CreateTable',
        INSERT_ENTITY: 'InsertEntity',
        DELETE_TABLE: 'DeleteTable',
        DELETE_ENTITY: 'DeleteEntity',
        QUERY_TABLE: 'QueryTable'
    }
}

const CopyStatus = {
    PENDING: 'pending',
    SUCCESS: 'success',
    FAILED: 'failed',
    ABORTED: 'aborted'
}

// See allowed operations below in comments
const ServiceSAS = {
    Blob: {
        // Read the content, properties, metadata or block list of any blob in the container. Use any blob in the container as the source of a copy operation.
        READ: 'r',
        // Add a block to any append blob in the container.
        ADD: 'a',
        // Write a new blob to the container, snapshot any blob in the container, or copy a blob to a new blob in the container.
        CREATE: 'c',
        // For any blob in the container, create or write content, properties, metadata, or block list. Snapshot or lease the blob. 
        // Resize the blob (page blob only). Use the blob as the destination of a copy operation. Note: You cannot grant permissions 
        // to read or write container properties or metadata, nor to lease a container, with a service SAS. Use an account SAS instead.
        WRITE: 'w',
        // Delete any blob in the container. Note: You cannot grant permissions to delete a container with a service SAS. Use an account SAS instead.
        DELETE: 'd',
        // List blobs in the container.
        LIST: 'l'
    }
}

const _key = `Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==`;
const Keys = {
    AccessKey: _key,
    DecodedAccessKey: Buffer.from(_key, 'base64')
}

const ODataMode = {
    NONE: 'nometadata',
    MINIMAL: 'minimalmetadata',
    FULL: 'fullmetadata' 
}

module.exports = {
    StorageTables: StorageTables,
    StorageEntityType: StorageEntityType,
    LeaseStatus: LeaseStatus,
    LeaseActions: LeaseActions,
    Usage: Usage,
    Operations: Operations,
    CopyStatus: CopyStatus,
    BlockListType: BlockListType,
    ServiceSAS: ServiceSAS,
    Keys: Keys,
    ODataMode: ODataMode,
    TableStorageTables: TableStorageTables
}