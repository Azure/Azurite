'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler');

class DeleteContainer extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        storageManager.deleteContainer(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(202).send();
            });
    }
}

module.exports = new DeleteContainer();