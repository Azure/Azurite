'use strict';

const storageManager = require('./../StorageManager'),
    N = require('./../model/HttpHeaderNames'),
    StandardHandler = require('./StandardHandler');

class SnapshotBlob extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        storageManager.snapshotBlob(request)
            .then((response) => {
                response.addHttpProperty(N.SNAPSHOT_DATE, response.proxy.snapshotDate);
                res.set(response.httpProps);
                res.status(201).send();
            });
    }
}

module.exports = new SnapshotBlob();