'use strict';

const storageManager = require('./../StorageManager');

class DeleteContainer {
    constructor() {
    }

    process(request, res) {
        storageManager.deleteContainer(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(response.statusCode).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new DeleteContainer();