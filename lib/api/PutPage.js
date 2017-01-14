'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader'),
    BlobTypes = require('./../Constants').BlobTypes,
    Blob = require('./../model/Blob');

class PutPage {
    constructor() {
    }

    process(req, res, containerName, blobName, body) {
        const blob = new Blob(blobName, req.headers, BlobTypes.PageBlob);
        return storageManager.putPage(containerName, blob, body)
            .then((response) => {
                res.set(new ResponseHeader(response, null, { 'x-ms-request-server-encrypted': false }));
                res.status(201).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new PutPage();