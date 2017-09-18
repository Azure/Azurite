'use strict';

const storageManager = require('./../StorageManager'),
    N = require('../model/HttpHeaderNames');

class CopyBlob {
    constructor() {
    }

    process(azuriteRequest, res) {
        storageManager.copyBlob(azuriteRequest)
            .then((response) => {
                response.addHttpProperty(N.COPY_STATUS, response.proxy.original.copyStatus);
                response.addHttpProperty(N.COPY_ID, response.proxy.original.copyId);
                res.set(response.httpProps);
                res.status(202).send();
            });
    }
}

module.exports = new CopyBlob();