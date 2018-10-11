/** @format */

"use strict";

const AzuriteTableResponse = require("./../../model/table/AzuriteTableResponse"),
  tableStorageManager = require("./../../core/table/TableStorageManager"),
  ODataMode = require("./../../core/Constants").ODataMode,
  N = require("./../../core/HttpHeaderNames");

const storageAccount = process.env.AZURE_STORAGE_ACCOUNT || 'devstoreaccount1'

class QueryTable {
  constructor() {}

  process(request, res) {
    tableStorageManager.queryTable(request).then((response) => {
      res.set(response.httpProps);
      const payload = this._createResponsePayload(
        response.payload,
        request.accept
      );
      res.status(200).send(payload);
    });
  }

  _createResponsePayload(payload, accept) {
    const response = {};
    if (accept !== ODataMode.NONE) {
      response[
        "odata.metadata"
      ] = `http://127.0.0.1:10002/${storageAccount}/$metadata#Tables`;
    }
    response.value = [];
    let i = 0;
    for (const item of payload) {
      response.value.push(item.odata(accept));
      delete response.value[i]["odata.metadata"];
      ++i;
    }
    return response;
  }
}

module.exports = new QueryTable();
