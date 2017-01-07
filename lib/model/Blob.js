'use strict';

const StorageItem = require('./StorageItem');

class Blob extends StorageItem {
    constructor(name, httpHeader, blobType) {
        super(name, httpHeader);
        this.blobType = blobType || 'BlockBlob';
        this.httpProps['x-ms-blob-type'] = this.blobType;
        this._addProps();
    }

    _addProps() {
        // TODO: Replace with Constants and put in different function or maybe even own class
        if (this.blobType === 'AppendBlob') {
            this.httpProps['x-ms-blob-committed-block-count'] = 0;
        }
    }
}

module.exports = Blob;