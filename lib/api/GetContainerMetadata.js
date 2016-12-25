'use strict';

const storageManager = require('./../StorageManager'),
    ResponseHeader = require('./../model/ResponseHeader');

class GetContainerMetadata {
    constructor() {
    }

    process(req, res, containerName) {
        return storageManager.getContainerMetadata(containerName)
            .then((result) => {
                res.set(new ResponseHeader(result.httpProps, result.metaProps));
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

module.exports = new GetContainerMetadata();