'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler');

class GetContainerMetadata extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        return storageManager.getContainerMetadata(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

module.exports = new GetContainerMetadata();