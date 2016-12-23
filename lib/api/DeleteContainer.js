'use strict';

const storageManager = require('./../StorageManager'),
    Container = require('./../model/Container'),
    ResponseHeader = require('./../model/ResponseHeader');


class DeleteContainer {
    constructor() {
    }

    process(req, res, containerName) {
        storageManager.deleteContainer(containerName)
            .then((result) => {
                res.set(new ResponseHeader());
                res.status(200).send();
            })
            .catch((e) => {
                if (e.code === "ENOENT") {
                    res.status(404).send();
                } else {
                    res.status(500).send();
                    throw e;
                }
            });
    }
}

module.exports = new DeleteContainer();