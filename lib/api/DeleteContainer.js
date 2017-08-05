'use strict';

const storageManager = require('./../StorageManager'),
    Container = require('./../model/Container'),
    Usage = require('./../Constants').Usage;

class DeleteContainer {
    constructor() {
    }

    process(req, res, containerName) {
        const request = new ContainerRequest({ containerName: containerName, httpHeaders: req.headers, rawHeaders: req.rawHeaders, usage: Usage.Delete });
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