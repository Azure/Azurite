'use strict';

const storageManager = require('./../../StorageManager'),
    N = require('../../model/blob/HttpHeaderNames');

class AbortCopyBlob {
    constructor() {
    }

    process(azuriteRequest, res) {
        storageManager.copyBlob(azuriteRequest)
            .then((response) => {
                res.status(204).send();
            });
    }
}

module.exports = new AbortCopyBlob();