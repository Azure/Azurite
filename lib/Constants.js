'use strict';

const StorageTables = {
    Containers: 'Containers',
    Commits: 'Commmits',
    Pages: 'Pages',
    Snapshots: 'Snapshots'
}

const BlobTypes = {
    BlockBlob: 'BlockBlob',
    AppendBlob: 'AppendBlob',
    PageBlob: 'PageBlob'
}

module.exports = {
    StorageTables: StorageTables,
    BlobTypes: BlobTypes
}