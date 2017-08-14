'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler');

class PutBlob extends StandardHandler {
    constructor() {
    }

    processImpl(azuriteRequest, res) {
        storageManager.putBlob(azuriteRequest)
            .then((response) => {
                response.addHttpProperty('x-ms-request-server-encrypted', false);
                res.set(response.httpProps);
                res.status(201).send();
            });
    }
}

module.exports = new PutBlob();