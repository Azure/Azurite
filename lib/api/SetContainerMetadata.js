'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader'),
    Container = require('./../model/Container');

class SetContainerMetadata {
    constructor() {
    }

    process(req, res, containerName) {
        const container = new Container(containerName, req.headers);
        return storageManager.setContainerMetadata(container)
            .then((result) => {
                res.set(new ResponseHeader(result));
                res.status(200).send();
            })
            .catch((e) => {
                res.status(e.statusCode || 500).send(e.message);
                if (!e.statusCode) throw e;
            });
    }
}

module.exports = new SetContainerMetadata();