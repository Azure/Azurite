'use strict';

import storageManager from './../../core/blob/StorageManager';

import N from './../../core/HttpHeaderNames';

// TODO: - IsPending Validation module (uses CopyOpsManager)
//       - Copy committed block blocks
//       - Copy needs to be aborted if ETag changes while copy is pending 

class CopyBlob {
    constructor() {
    }

    process(azuriteRequest, res) {
        storageManager.copyBlob(azuriteRequest)
            .then((response) => {
                response.addHttpProperty(N.COPY_STATUS, response.proxy.original.copyStatus);
                response.addHttpProperty(N.COPY_ID, response.proxy.original.copyId);
                res.set(response.httpProps);
                res.status(202).send();
            });
    }
}

export default new CopyBlob();