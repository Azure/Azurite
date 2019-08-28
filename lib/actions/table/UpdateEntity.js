/** @format */

"use strict";

const AzuriteTableResponse = require("./../../model/table/AzuriteTableResponse"),
  tableStorageManager = require("./../../core/table/TableStorageManager"),
  ODataMode = require("./../../core/Constants").ODataMode,
  N = require("./../../core/HttpHeaderNames");

class UpdateEntity {
  constructor() {}

  process(request, res) {
    tableStorageManager.updateEntity(request).then((response) => {
      response.addHttpProperty(N.ETAG, response.proxy.etag);
      res.set(response.httpProps);
      res.status(204).send();
    });
  }
}

module.exports = new UpdateEntity();
