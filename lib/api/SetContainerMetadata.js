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
                if (e.code === 'NO_CONTAINER') {
                    res.status(404).send('Container does not exist');
                } else {
                    res.status(500).send('Unexpected error.')
                    throw e;
                }
            });
    }
}

module.exports = new SetContainerMetadata();