'use strict';

const storageManager = require('./../StorageManager');

class SetContainerAcl {
    constructor() {
    }

    process(request, res) {
        storageManager.setContainerAcl(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

module.exports = new SetContainerAcl();