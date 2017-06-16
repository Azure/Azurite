'use strict';

const storageManager = require('./../StorageManager'),
    Blob = require('./../model/Blob'),
    ResponseHeader = require('./../model/ResponseHeader');

class SnapshotBlob {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        const blob = new Blob(blobName, req.headers)
        storageManager.snapshotBlob(containerName, blob)
            .then((result) => {
                res.set(new ResponseHeader(result.httpProps, null, { 'x-ms-snapshot': result['x-ms-snapshot'] }));
                res.status(201).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new SnapshotBlob();