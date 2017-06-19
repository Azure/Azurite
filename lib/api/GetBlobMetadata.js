'use strict';

const storageManager = require('./../StorageManager'),
    Blob = require('./../model/Blob'),
    ResponseHeader = require('./../model/ResponseHeader');

class GetBlobMetadata {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        const blob = new Blob(blobName, req.headers);
        if (req.query.snapshot) {
            blob.setSnapshotDate(req.query.snapshot);
        }
        storageManager.getBlobMetadata(containerName, blob)
            .then((result) => {
                res.set(new ResponseHeader(result.httpProps, result.metaProps));
                res.status(200).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new GetBlobMetadata();