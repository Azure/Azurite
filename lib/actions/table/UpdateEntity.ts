const AzuriteTableResponse = from "./../../model/table/AzuriteTableResponse"),
  tableStorageManager = from "./../../core/table/TableStorageManager"),
  ODataMode = from "./../../core/Constants").ODataMode;
import N from "./../../core/HttpHeaderNames";

class UpdateEntity {
  public process(request, res) {
    tableStorageManager.updateEntity(request).then(response => {
      res.set(response.httpProps);
      res.status(204).send();
    });
  }
}

export default new UpdateEntity();
