'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler');

class CreateContainer extends StandardHandler {
    constructor() {
    }

    processImpl(azuriteRequest, res) {
        storageManager.createContainer(azuriteRequest)
            .then((response) => {
                res.set(response.httpProps);
                res.status(201).send();
            });
    }
}

module.exports = new CreateContainer();