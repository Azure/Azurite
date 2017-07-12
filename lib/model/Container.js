'use strict';

const StorageItem = require('./StorageItem');

class Container extends StorageItem {
    constructor(name, httpHeader, rawHeaders) {
        super(name, httpHeader, rawHeaders);
        this.access = httpHeader['x-ms-blob-public-access'] || 'private';
    }
}

module.exports = Container;