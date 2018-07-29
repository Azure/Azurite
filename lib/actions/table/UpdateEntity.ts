const AzuriteTableResponse = require("./../../model/table/AzuriteTableResponse"),
  tableStorageManager = require("./../../core/table/TableStorageManager"),
  ODataMode = require("./../../core/Constants").ODataMode,
  N = require("./../../core/HttpHeaderNames");

class UpdateEntity {
  constructor() {}

  process(request, res) {
    tableStorageManager.updateEntity(request).then(response => {
      res.set(response.httpProps);
      res.status(204).send();
    });
  }
}

export default new UpdateEntity();
