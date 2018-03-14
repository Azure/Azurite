'use strict';

const AzuriteTableResponse = require('./../../model/table/AzuriteTableResponse'),
    tableStorageManager = require('./../../core/table/TableStorageManager');

class QueryEntities {
    constructor() {
    }

    process(request, res) {
        tableStorageManager.queryEntities(request)
        .then((response) => {
            res.set(response.httpProps);
            // const payload = this._createResponsePayload(response.payload, request.accept);
            res.status(200).send(payload);
        });
    }
}

module.exports = new QueryEntities();