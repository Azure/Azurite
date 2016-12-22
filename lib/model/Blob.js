'use strict';

const StorageItem = require('./StorageItem');

class Blob extends StorageItem {
    constructor(name, httpHeader) {
        super(name, httpHeader);
    }
}

module.exports = Blob;