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
                if (e.code === 'ENOENT') {
                    res.status(404).send();
                } else if (e.code === 'EACCES') {
                    res.status(404).send();
                } else if (e.code === 'md5') {
                    res.status(400).send();
                } else if (e.code === 'UNSUPPORTED_BLOB_TYPE') {
                    res.status(400).send();
                } else if (e.code === 'InvalidBlobType') {
                    res.status(409).send(e.message);
                } 
                else {
                    res.status(500).send();
                    throw e;
                }
            })
    }
}

module.exports = new PutBlob();