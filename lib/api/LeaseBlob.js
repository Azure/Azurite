'use strict';

const storageManager = require('./../StorageManager'),
    Blob = require('./../model/Blob'),
    ResponseHeader = require('./../model/ResponseHeader');

class LeaseBlob {
    constructor() {
    }
    process(req, res, containerName, blobName) {
        const blob = new Blob(blobName, req.headers);
        storageManager.leaseBlob(containerName, blob)
            .then((result) => {
                res.set(new ResponseHeader(result.props));
                res.status(result.statusCode).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new LeaseBlob();