import tableStorageManager from "./../../core/table/TableStorageManager";

class DeleteEntity {
  public process(request, res) {
    tableStorageManager.deleteEntity(request).then(response => {
      res.set(request.httpProps);
      res.status(204).send();
    });
  }
}

export default new DeleteEntity();
