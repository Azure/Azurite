'use strict';

const storageManager = require('./../../core/blob/StorageManager');

class CreateContainer {
    constructor() {
    }

    process(azuriteRequest, res) {
        storageManager.createContainer(azuriteRequest)
            .then((response) => {
                res.set(response.httpProps);
                res.status(201).send();
            });
    }
}

module.exports = new CreateContainer();