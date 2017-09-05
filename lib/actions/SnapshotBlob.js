'use strict';

const storageManager = require('./../StorageManager'),
    N = require('./../model/HttpHeaderNames');

class SnapshotBlob {
    constructor() {
    }

    process(request, res) {
        storageManager.snapshotBlob(request)
            .then((response) => {
                response.addHttpProperty(N.SNAPSHOT_DATE, response.proxy.original.snapshotDate);
                res.set(response.httpProps);
                res.status(201).send();
            });
    }
}

module.exports = new SnapshotBlob();