'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader');

class DeleteBlob {
    constructor(){
    }

    process(req, res, container, blob) {
        storageManager.deleteBlob(container, blob)
            .then(() => {
                res.set(new ResponseHeader());
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
}

module.exports = new DeleteBlob();