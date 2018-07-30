import tableStorageManager from "./../../core/table/TableStorageManager";

class DeleteTable {
  public process(request, res) {
    tableStorageManager.deleteTable(request).then(response => {
      res.set(request.httpProps);
      res.status(201).send();
    });
  }
}

export default new DeleteTable();
