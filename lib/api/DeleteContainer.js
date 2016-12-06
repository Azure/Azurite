'use strict';

const storageManager = require('./../StorageManager');

class DeleteContainer {
    constructor() {
    }

    process(req, res) {
        const containerName = req.params.container
        storageManager.deleteContainer(containerName)
            .then((result) => {
                console.log(`Successfully deleted container "${containerName}"`);
                res.status(200).send();
            })
            .catch((e) => {
                if (e.code === "ENOENT") {
                    console.error(`Container ${containerName} does not exist.`);
                    res.status(404).send();
                } else {
                    res.status(500).send();
                    throw e;
                }
            });
    }
}

module.exports = new DeleteContainer();