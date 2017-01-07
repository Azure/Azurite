'use strict';

const storageManager = require('./../StorageManager'),
    Blob = require('./../model/Blob'),
    BbPromise = require('bluebird'),
    ResponseHeader = require('./../model/ResponseHeader');

class PutBlob {
    constructor() {
    }

    process(req, res, containerName, blobName, blobType) {
        BbPromise.try(() => {
            const blob = new Blob(blobName, req.headers, blobType);
            return storageManager.putBlob(containerName, blob, req.body);
        })
            .then((result) => {
                res.set(new ResponseHeader(result, null, { 'x-ms-request-server-encrypted': false }));
                res.status(201).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new PutBlob();