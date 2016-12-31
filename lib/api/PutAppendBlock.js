'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader'),
    Blob = require('./../model/Blob');

class PutAppendBlock {
    constructor() {
    }

    process(req, res, containerName, blobName, body) {
        const blob = new Blob(blobName, req.headers, 'AppendBlob');
        const contentLength = blob.httpProps['content-length'] || blob.httpProps['Content-Length'];
        if (!contentLength) {
            res.status(411).send('LengthRequired');
            return;
        }
        // AppendBlobs larger than 4MB are not allowed as per specification at
        // https://docs.microsoft.com/en-us/rest/api/storageservices/fileservices/append-block
        if (body.length > 4194304) {
            res.status(413).send();
            return;
        }
        return storageManager.putAppendBlock(containerName, blob, body)
            .then((response) => {
                response['x-ms-request-server-encrypted'] = false;
                res.set(new ResponseHeader(response));
                res.status(201).send('Created');
                })
            .catch((e) => {
                if (e.code === 'PreconditionFailed') {
                    res.status(412).send(e.code);
                } else if (e.code === 'InvalidBlobType') {
                    res.status(409).send(e.code);
                } else if (e.code === 'BlockCountExceedsLimit') {
                    res.status(409).send(e.code);
                } else if (e.code === 'MD5HashCorrupted') {
                    res.status(400).send(e.code);
                } else {
                    res.status(500).send();
                    throw e;
                }
            });
    }
}

module.exports = new PutAppendBlock();