const AzuriteTableResponse = require("./../../model/table/AzuriteTableResponse"),
  tableStorageManager = require("./../../core/table/TableStorageManager"),
  N = require("./../../core/HttpHeaderNames");

class InsertOrMergeEntity {
  constructor() {}

  process(request, res) {
    tableStorageManager.insertOrMergeEntity(request).then(response => {
      response.addHttpProperty(N.ETAG, response.proxy.etag);
      res.set(response.httpProps);
      res.status(204).send();
    });
  }
}

export default new InsertOrMergeEntity();
