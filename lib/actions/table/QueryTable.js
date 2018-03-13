'use strict';

const AzuriteTableResponse = require('./../../model/table/AzuriteTableResponse'),
    tableStorageManager = require('./../../core/table/TableStorageManager'),
    ODataMode = require('./../../core/Constants').ODataMode,
    N = require('./../../core/HttpHeaderNames');

class QueryTable {
    constructor() {
    }

    process(request, res) {
        tableStorageManager.queryTable(request)
        .then((response) => {
            res.set(request.httpProps);
            const payload = this._createResponsePayload(response.payload, request.accept);
            res.status(200).send(JSON.stringify(payload));
        });
    }

    _createResponsePayload(payload, accept) {
        const response = {};
        if (accept !== ODataMode.NONE) {
            response['odata.metadata'] = `http://127.0.0.1:10002/devstoreaccount1/$metadata#Tables`;
        }
        response.value = [];
        let i = 0;
        for (const item of payload) {
            response.value.push(item.odata(accept))
            delete response[i]['odata.metadata'];
        }
        return response;
    }
}

module.exports = new QueryTable();