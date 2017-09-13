'use strict';

const storageManager = require('./../StorageManager');

class CopyBlob {
    constructor() {
    }

    process(azuriteRequest, res) {
        storageManager.copyBlob(azuriteRequest)
            .then((response) => {
                res.set(response.httpProps);
                res.status(202).send();
            });
    }
}

module.exports = new CopyBlob();