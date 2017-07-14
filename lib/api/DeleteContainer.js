'use strict';

const storageManager = require('./../StorageManager'),
    Container = require('./../model/Container'),
    ResponseHeader = require('./../model/ResponseHeader');


class DeleteContainer {
    constructor() {
    }

    process(req, res, containerName) {
        storageManager.deleteContainer(containerName, { leaseId: req.headers['x-ms-lease-id'] })
            .then((result) => {
                res.set(new ResponseHeader());
                res.status(202).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new DeleteContainer();