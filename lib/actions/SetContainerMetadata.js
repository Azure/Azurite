'use strict';

const storageManager = require('./../StorageManager');

class SetContainerMetadata {
    constructor() {
    }

    process(request, res) {
        return storageManager.setContainerMetadata(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

module.exports = new SetContainerMetadata();