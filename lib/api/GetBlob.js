'use strict';

const storageManager = require('./../StorageManager');

class GetBlob {
    constructor(){
    }

    process(req, res, container, blob, range) {
        storageManager.getBlob(container, blob, range)
            .then(() => {
                res.status(200).send();
            })
            .catch((e) => {
                throw e;
            });
    }
}

module.exports = new GetBlob();