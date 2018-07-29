import storageManager from "./../../core/blob/StorageManager";

class DeleteBlob {
  public process(azuriteRequest, res) {
    storageManager.deleteBlob(azuriteRequest).then(response => {
      res.set(response.httpProps);
      res.status(202).send();
    });
  }
}

module.exports = new DeleteBlob();
