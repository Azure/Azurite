'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader'),
    Blob = require('./../model/Blob');

class DeleteBlob {
    constructor(){
    }

    process(req, res, containerName, blobName) {
        const blob = new Blob(blobName);
        if (req.query.snapshot) {
            blob.setSnapshotDate(req.query.snapshot);
        }
        storageManager.deleteBlob(containerName, new Blob(blobName))
            .then(() => {
                res.set(new ResponseHeader());
                res.status(202).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new DeleteBlob();