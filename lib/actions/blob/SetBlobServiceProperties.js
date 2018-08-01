'use strict';

import storageManager from './../../core/blob/StorageManager';

class SetBlobServiceProperties {
    constructor() {
    }

    process(request, res) {
        storageManager.setBlobServiceProperties(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(202).send();
            });
    }
}

export default new SetBlobServiceProperties();
