'use strict';

const storageManager = require('./../StorageManager');

class SetBlobMetadata {
    constructor() {
    }

    process(request, res) {
        return storageManager.setBlobMetadata(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

module.exports = new SetBlobMetadata();