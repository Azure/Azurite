'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler');


class DeleteBlob extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        storageManager.deleteBlob(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(202).send();
            });
    }
}

module.exports = new DeleteBlob();