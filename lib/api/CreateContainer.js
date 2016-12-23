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
                res.status(200).send();
            })
            .catch((e) => {
                if (e.code === "EEXIST") {
                    res.status(409).send();
                } else {
                    res.status(500).send();
                    // We throw and thus abort this process since our database might be corrupted.
                    throw e;
                }
            });
    }
}

module.exports = new CreateContainer();