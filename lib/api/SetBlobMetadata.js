'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler');

class SetBlobMetadata extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        return storageManager.setBlobMetadata(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

module.exports = new SetBlobMetadata();