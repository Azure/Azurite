'use strict';
const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader'),
    BlobTypes = require('./../Constants').BlobTypes,
    Blob = require('./../model/Blob');

class PutBlock {
    constructor() {
    }

    process(req, res, containerName, blobName, blockId) {
        const options = {
            blockId: blockId,
            contentLength: req.headers['content-length'] || req.headers['Content-Length'],
            fileName: `${containerName}-${blobName}-${blockId}`,
            parent: `${containerName}-${blobName}`,
            blob: new Blob(blobName, req.headers, BlobTypes.BlockBlob)
        }
        storageManager.putBlock(containerName, blobName, req.body, options)
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

module.exports = new PutBlock();