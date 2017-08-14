'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler');

class DeleteContainer extends StandardHandler {
    constructor() {
    }

    processImpl(azuriteRequest, res) {
        storageManager.deleteContainer(azuriteRequest)
            .then((response) => {
                res.set(response.httpProps);
                res.status(202).send();
            });
    }
}

module.exports = new DeleteContainer();