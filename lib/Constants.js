'use strict';

const StorageTables = {
    Containers: 'Containers',
    Commits: 'Commmits',
    Pages: 'Pages'
}

const StorageEntityType = {
    Container: 1,
    BlockBlob: 2,
    AppendBlob: 4,
    PageBlob: 8
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

const Operations = {
    Account: {
        LIST_CONTAINERS: 'ListContainers'
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
        APPEND_BLOCK: 'AppendBlock'
    }
}

module.exports = {
    StorageTables: StorageTables,
    StorageEntityType: StorageEntityType,
    LeaseStatus: LeaseStatus,
    LeaseActions: LeaseActions,
    Usage: Usage,
    Operations: Operations
}