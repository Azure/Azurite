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
                const payload = this._createResponsePayload(response.payload, request.tableName, request.accept, request.singleEntity);
                res.status(200).send(payload);
            });
    }

    _createResponsePayload(payload, tableName, accept, singleEntity) {

        let response = {};

        if (accept !== ODataMode.NONE) {
            response['odata.metadata'] = `http://127.0.0.1:10002/devstoreaccount1/$metadata#${tableName}`;
        }

        if(singleEntity) {

            for (const item of payload) {

                response['PartitionKey'] = item.partitionKey;
                response['RowKey'] = item.rowKey;

                response = Object.assign({}, response, item.attribs(ODataMode.FULL));

            }

            return response;
        }

        response.value = [];

        let i = 0;

        for (const item of payload) {
            response.value.push(item.attribs(accept));
            response.value[i]['PartitionKey'] = item.partitionKey;
            response.value[i]['RowKey'] = item.rowKey;
            if (accept === ODataMode.FULL) {
                const odataItems = item.odata(accept);
                for (const key of odataItems) {
                    response.value[i][key] = odataItems[key];
                }
                delete response.value[i]['odata.metadata'];
            }
            ++i;
        }

        return response;

    }
}

module.exports = new QueryEntities();