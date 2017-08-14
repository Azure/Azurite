'use strict';

const storageManager = require('./../StorageManager'),
    Usage = require('./../Constants').Usage,
    BlobRequest = require('./../model/AzuriteBlobRequest'),
    AzuriteResponse = require('./../model/AzuriteResponse');

class PutBlob {
    constructor() {
    }

    process(req, res, containerName, blobName, blobType) {
        const request = new BlobRequest({
            req: req, 
            entityType: blobType,
            usage: Usage.Write
        });
        storageManager.putBlob(request)
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