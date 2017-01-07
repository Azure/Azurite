'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader'),
    Blob = require('./../model/Blob');

class SetBlobProperties {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        const blob = new Blob(blobName, req.headers);
        storageManager.setBlobProperties(containerName, blob)
            .then((result) => {
                res.set(new ResponseHeader(result));
                res.status(200).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new SetBlobProperties();
