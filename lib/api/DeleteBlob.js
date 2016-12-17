'use strict';

const storageManager = require('./../StorageManager');

class DeleteBlob {
    constructor(){
    }

    process(req, res, container, blob) {
        storageManager.deleteBlob(container, blob)
            .then((result) => {
                res.status(202).send();
            })
            .catch((e) => {
                if (e.code === "ENOENT") {
                    res.status(404).send('BlobNotFound');
                } else {
                    res.status(500).send();
                    throw e;
                }
            });
    }

    _addResponseHeaders(res) {
        res.set({
            'x-ms-version': '2011-08-18'
        });  
    }
}

module.exports = new DeleteBlob();