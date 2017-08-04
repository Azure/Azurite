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

module.exports = {
    StorageTables: StorageTables,
    StorageEntityType: StorageEntityType
}