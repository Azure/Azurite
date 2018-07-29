const AzuriteTableResponse = from "./../../model/table/AzuriteTableResponse"),
  tableStorageManager = from "./../../core/table/TableStorageManager");
import N from "./../../core/HttpHeaderNames";

class DeleteEntity {
  public process(request, res) {
    tableStorageManager.deleteEntity(request).then(response => {
      res.set(request.httpProps);
      res.status(204).send();
    });
  }
}

export default new DeleteEntity();
