'use strict';

import AzuriteTableResponse from './../../model/table/AzuriteTableResponse';
import { ODataMode } from './../../core/Constants';
import tableStorageManager from './../../core/table/TableStorageManager';

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
        // case where we do not have an array
        if(singleEntity){
            for(const item of payload){
                response['PartitionKey'] = item.partitionKey;
                response['RowKey'] = item.rowKey;
                response = Object.assign({}, response, item.attribs(accept));
            }
        }
        else if(payload.length === 1){
            response['PartitionKey'] = payload[0].partitionKey;
            response['RowKey'] = payload[0].rowKey;
            for(const attrib in payload[0].attribs(accept)){
                response[attrib] = payload[0]._.attribs[attrib];
            }
        }
        else if (payload.length > 1) {
            response.value = [];
            let i = 0;
            for (const item of payload) {
                response.value.push(item.attribs(accept));
                response.value[i]['PartitionKey'] = item.partitionKey;
                response.value[i]['RowKey'] = item.rowKey;
                // content is determined by the odata format
                // https://docs.microsoft.com/en-us/rest/api/storageservices/payload-format-for-table-service-operations
                ++i;
            }
        }

        return response;

    }
}

export default new QueryEntities();