'use strict';

const storageManager = require('./../StorageManager'),
    Blob = require('./../model/Blob'),
    ResponseHeader = require('./../model/ResponseHeader');

class CreateBlockBlob {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        const blob = new Blob(blobName, req.headers);
        storageManager.createBlockBlob(containerName, blob, req.body)
            .then((result) => {
                res.set(new ResponseHeader(result, null, { 'x-ms-request-server-encrypted': false }));
                res.status(201).send();
            })
            .catch((e) => {
                if (e.code === 'ENOENT') {
                    res.status(404).send();
                } else if (e.code === 'EACCES') {
                    res.status(404).send();
                } else if (e.name === 'md5') {
                    res.status(400).send(e.message);
                } else {
                    res.status(500).send();
                    throw e;
                }
            })
    }
}

module.exports = new CreateBlockBlob();