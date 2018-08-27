'use strict';

import storageManager from './../../core/blob/StorageManager';

class DeleteBlob {
    constructor() {
    }

    process(azuriteRequest, res) {
        storageManager.deleteBlob(azuriteRequest)
            .then((response: any) => {
                res.set(response.httpProps);
                res.status(202).send();
            });
    }
}

export default new DeleteBlob();