const AzuriteTableResponse = require("./../../model/table/AzuriteTableResponse"),
  tableStorageManager = require("./../../core/table/TableStorageManager"),
  ODataMode = require("./../../core/Constants").ODataMode,
  N = require("./../../core/HttpHeaderNames");

class MergeEntity {
  constructor() {}

  process(request, res) {
    tableStorageManager.mergeEntity(request).then(response => {
      response.addHttpProperty(N.ETAG, response.proxy.etag);
      res.set(response.httpProps);
      res.status(204).send();
    });
  }
}

export default new MergeEntity();
