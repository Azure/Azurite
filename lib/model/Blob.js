'use strict';

const StorageItem = require('./StorageItem');

class Blob extends StorageItem {
    constructor(name, httpHeader, blobType) {
        super(name, httpHeader);
        this.httpProps['x-ms-blob-type'] = blobType || 'BlockBlob';
    }
}

module.exports = Blob;