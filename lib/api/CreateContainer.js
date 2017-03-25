'use strict';

const storageManager = require('./../StorageManager'),
    Container = require('./../model/Container'),
    ResponseHeader = require('./../model/ResponseHeader');

class CreateContainer {
    constructor() {
    }

    process(req, res, containerName) {
        const container = new Container(containerName, req.headers)
        storageManager.createContainer(container)
            .then(() => {
                res.set(new ResponseHeader(container.httpProps));
                res.status(201).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new CreateContainer();