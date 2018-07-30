import tableStorageManager from "./../../core/table/TableStorageManager";

class UpdateEntity {
  public process(request, res) {
    tableStorageManager.updateEntity(request).then(response => {
      res.set(response.httpProps);
      res.status(204).send();
    });
  }
}

export default new UpdateEntity();
