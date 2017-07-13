'use strict';

const storageManager = require('./../StorageManager'),
    Container = require('./../model/Container'),
    ResponseHeader = require('./../model/ResponseHeader');

class LeaseContainer {
    constructor() {
    }

    process(req, res, containerName) {
        const container = new Container(containerName, req.headers, req.rawHeaders)
        storageManager.leaseContainer(container)
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

module.exports = new LeaseContainer();