'use strict';

import AzuriteTableResponse from './../../model/table/AzuriteTableResponse';
import tableStorageManager from './../../core/table/TableStorageManager';
import N from './../../core/HttpHeaderNames';

class InsertEntity {
    constructor() {
    }

    process(request, res) {
        tableStorageManager.insertEntity(request)
            .then((response) => {
                if (request.httpProps[N.PREFER] === 'return-no-content') {
                    response.addHttpProperty(N.PREFERENCE_APPLIED, 'return-no-content');
                    res.status(204).send();
                    return;
                }
                const payload = Object.assign({}, response.proxy.odata(request.accept), response.proxy.attribs(request.accept));
                response.addHttpProperty(N.ETAG, response.proxy.etag);
                response.addHttpProperty(N.PREFERENCE_APPLIED, 'return-content');
                res.set(response.httpProps);
                res.status(201).send(payload);
            });
    }
}

export default new InsertEntity;