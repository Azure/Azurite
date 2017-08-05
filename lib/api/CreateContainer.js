'use strict';

const storageManager = require('./../StorageManager'),
    ContainerRequest = require('./../model/AzuriteContainerRequest');

class CreateContainer {
    constructor() {
    }

    process(req, res, containerName) {
        const request = new ContainerRequest(containerName, req.headers, req.rawHeaders);
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