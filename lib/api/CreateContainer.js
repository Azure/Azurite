'use strict';

const storageManager = require('./../StorageManager');

class CreateContainer {
    constructor() {
    }

    process(request, res) {
        storageManager.createContainer(request)
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

module.exports = new CreateContainer();