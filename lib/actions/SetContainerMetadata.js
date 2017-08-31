'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler');

class SetContainerMetadata extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        return storageManager.setContainerMetadata(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

module.exports = new SetContainerMetadata();