'use strict';

import AzuriteTableResponse from './../../model/table/AzuriteTableResponse';
import tableStorageManager from './../../core/table/TableStorageManager';
import N from './../../core/HttpHeaderNames';

class InsertOrReplaceEntity {
    constructor() {
    }

    process(request, res) {
        tableStorageManager.insertEntity(request)
            .then((response) => {
                response.addHttpProperty(N.ETAG, response.proxy.etag);
                res.set(response.httpProps);
                res.status(204).send();
            });
    }
}

export default new InsertOrReplaceEntity;