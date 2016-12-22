'use strict';

const storageManager = require('./../StorageManager'),
    Blob = require('./../model/Blob');

class CreateBlockBlob {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        const blob = new Blob(blobName, req.headers);
        storageManager.createBlockBlob(containerName, blob, req.body)
            .then((result) => {
                this._addResponseHeaders(res, result)
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

    _addResponseHeaders(res, props) {
        res.set({
            'ETag': props.ETag,
            'Last-Modified': props.lastModified,
            'x-ms-version': '2011-08-18',
            'x-ms-request-server-encrypted': false,
            'Content-MD5': props.md5
        });
    }
}

module.exports = new CreateBlockBlob();