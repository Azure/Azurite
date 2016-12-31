'use strict';

const StorageItem = require('./StorageItem');

class Blob extends StorageItem {
    constructor(name, httpHeader, blobType) {
        super(name, httpHeader);
        this.blobType = blobType || 'BlockBlob';
        this.httpProps['x-ms-blob-type'] = this.blobType;
        this._checkProps();
    }

    _checkProps() {
        // Currently, Azurite does not support Page Blobs
        if (['BlockBlob', 'AppendBlob'].indexOf(this.blobType) === -1) {
            const e = new Error('Unsupported Blob Type');
            e.code = 'UNSUPPORTED_BLOB_TYPE';
            throw e;
        }
    }
}

module.exports = Blob;