'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader'),
    BlobTypes = require('./../Constants').BlobTypes,
    Blob = require('./../model/Blob');

class PutAppendBlock {
    constructor() {
    }

    process(req, res, containerName, blobName, body) {
        const blob = new Blob(blobName, req.headers, BlobTypes.AppendBlob);
        return storageManager.putAppendBlock(containerName, blob, body)
            .then((response) => {
                response['x-ms-request-server-encrypted'] = false;
                res.set(new ResponseHeader(response));
                res.status(201).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new PutAppendBlock();