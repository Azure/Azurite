'use strict';

const storageManager = require('./../StorageManager'),
    StandardHandler = require('./StandardHandler');

class SetBlobProperties extends StandardHandler {
    constructor() {
    }

    processImpl(request, res) {
        storageManager.setBlobProperties(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

module.exports = new SetBlobProperties();
