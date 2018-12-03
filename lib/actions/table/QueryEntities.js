/** @format */

"use strict";

const AzuriteTableResponse = require("./../../model/table/AzuriteTableResponse"),
  ODataMode = require("./../../core/Constants").ODataMode,
  tableStorageManager = require("./../../core/table/TableStorageManager");

class QueryEntities {
  constructor() {}

  process(request, res) {
    tableStorageManager.queryEntities(request).then((response) => {
      res.set(response.httpProps);
      const payload = this._createResponsePayload(
        response.payload,
        request.tableName,
        request.accept,
        request.singleEntity
      );
      res.status(200).send(payload);
    });
  }

  _createResponsePayload(payload, tableName, accept, singleEntity) {
    let response = {};

    if (accept !== ODataMode.NONE) {
      response[
        "odata.metadata"
      ] = `http://127.0.0.1:10002/devstoreaccount1/$metadata#${tableName}`;
    }
    // case where we do not have an array
    if (singleEntity) {
      for (const item of payload) {
        response["PartitionKey"] = item.partitionKey;
        response["RowKey"] = item.rowKey;
        response = Object.assign({}, response, item.attribs(accept));
      }
    } else {
      // the Query Entities operation returns the list of entities in a table
      // https://docs.microsoft.com/en-us/rest/api/storageservices/query-entities#response-body
      response.value = [];
      for (let i = 0; i < payload.length; i++) {
        let item = payload[i];
        response.value.push(item.attribs(accept));
        response.value[i]["PartitionKey"] = item.partitionKey;
        response.value[i]["RowKey"] = item.rowKey;
        // content is determined by the odata format
        // https://docs.microsoft.com/en-us/rest/api/storageservices/payload-format-for-table-service-operations
      }
    }

    return response;
  }
}

module.exports = new QueryEntities();
