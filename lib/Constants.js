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
    EXPIRED: 'expired',
}

module.exports = {
    StorageTables: StorageTables,
    StorageEntityType: StorageEntityType,
    LeaseStatus: LeaseStatus,
    Usage: Usage
}