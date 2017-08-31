'use strict';

const storageManager = require('./../StorageManager');

class DeleteContainer {
    constructor() {
    }

    process(azuriteRequest, res) {
        storageManager.deleteContainer(azuriteRequest)
            .then((response) => {
                res.set(response.httpProps);
                res.status(202).send();
            });
    }
}

module.exports = new DeleteContainer();