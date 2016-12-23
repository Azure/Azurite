'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader'),
    Blob = require('./../model/Blob');

class SetBlobMetadata {
    constructor() {
    }

    process(req, res, containerName, blobName) {
        const blob = new Blob(blobName, req.headers);
        return storageManager.setBlobMetadata(containerName, blob)
            .then((result) => {
                res.set(new ResponseHeader(result));
                res.status(200).send();
            })
            .catch((e) => {
                if (e.code === 'NO_CONTAINER') {
                    res.status(404).send('Container does not exist');
                } else if (e.code === 'NO_BLOB') {
                    res.status(404).send('Blob does not exist.');
                } else {
                    res.status(500).send('Unexpected error.')
                    throw e;
                }
            });
    }
}

module.exports = new SetBlobMetadata();