'use strict';

const AzuriteTableResponse = require('./../../model/table/AzuriteTableResponse'),
    ODataMode = require('./../../core/Constants').ODataMode,
    tableStorageManager = require('./../../core/table/TableStorageManager');

class QueryEntities {
    constructor() {
    }

    process(request, res) {
        tableStorageManager.queryEntities(request)
            .then((response) => {
                res.set(response.httpProps);
                const payload = this._createResponsePayload(response.payload, tableName, request.accept);
                res.status(200).send(payload);
            });
    }

    _createResponsePayload(payload, tableName, accept) {
        const response = {};
        if (accept !== ODataMode.NONE) {
            response['odata.metadata'] = `http://127.0.0.1:10002/devstoreaccount1/$metadata#${tableName}`;
        }
        response.value = [];
        let i = 0;
        for (const item of payload) {
            if (accept === ODataMode.FULL) {
                response.value.push(item.odata(accept))
                delete response.value[i]['odata.metadata'];
            }
            response.value.push(item.attribs(accept));
            ++i;
        }
        return response;
    }
}

module.exports = new QueryEntities();