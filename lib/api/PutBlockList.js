'use strict';

const storageManager = require('./../StorageManager');

class PutBlockList {
    constructor() {
    }

    process(req, res, containerName, blobName, xmlDoc) {
        const blockList = this._deserializeBlockList(xmlDoc); 
        storageManager.PutBlockList(containerName, blobName, blocklist)
            .then((response) => {

            })
            .catch((e) => {

            });
    }

    _deserializeBlockList(xmlDoc) {
        return {};
    }
}

module.exports = new PutBlockList();