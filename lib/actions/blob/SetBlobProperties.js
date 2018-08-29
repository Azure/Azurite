'use strict';

import storageManager from './../../core/blob/StorageManager';

class SetBlobProperties {
    constructor() {
    }

    process(request, res) {
        storageManager.setBlobProperties(request)
            .then((response) => {
                res.set(response.httpProps);
                res.status(200).send();
            });
    }
}

export default new SetBlobProperties();
