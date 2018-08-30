'use strict';

import AzuriteTableResponse from './../../model/table/AzuriteTableResponse';
import tableStorageManager from './../../core/table/TableStorageManager';
import N from './../../core/HttpHeaderNames';
// see: https://docs.microsoft.com/en-us/rest/api/storageservices/insert-entity

class InsertEntity {
    constructor() {}

    process(request, res) {
        tableStorageManager.insertEntity(request)
            .then((response) => {
                // If the request includes the Prefer header with the value 
                // return-no-content, no response body is returned. 
                // Otherwise, the response body is an OData entity set.
                if (request.httpProps[N.PREFER] === 'return-no-content') {
                    response.addHttpProperty(N.PREFERENCE_APPLIED, 'return-no-content');
                    const payload = Object.assign({
                        ".metadata": {
                            etag: response.proxy.etag,
                        },
                    });
                    res.status(204).send(payload);
                } else {
                    const payload = Object.assign({}, response.proxy.odata(request.accept), response.proxy.attribs(request.accept));
                    response.addHttpProperty(N.ETAG, response.proxy.etag);
                    response.addHttpProperty(N.PREFERENCE_APPLIED, 'return-content');
                    res.set(response.httpProps);
                    res.status(201).send(payload);
                }
            });
    }
}

export default new InsertEntity;
