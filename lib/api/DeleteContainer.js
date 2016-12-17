'use strict';

const storageManager = require('./../StorageManager');

class DeleteContainer {
    constructor() {
    }

    process(req, res) {
        const containerName = req.params.container
        storageManager.deleteContainer(containerName)
            .then((result) => {
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