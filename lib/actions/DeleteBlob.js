'use strict';

const storageManager = require('./../StorageManager');

class DeleteBlob {
    constructor() {
    }

    process(request, res) {
        storageManager.deleteBlob(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(202).send();
            });
    }
}

module.exports = new DeleteBlob();