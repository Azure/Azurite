'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler');

class CreateContainer extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        storageManager.createContainer(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(201).send();
            });
    }
}

module.exports = new CreateContainer();