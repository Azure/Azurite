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
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new DeleteBlob();