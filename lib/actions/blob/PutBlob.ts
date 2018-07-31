import storageManager from "./../../core/blob/StorageManager";

class PutBlob {
  public process(azuriteRequest, res) {
    storageManager.putBlob(azuriteRequest).then(response => {
      response.addHttpProperty("x-ms-request-server-encrypted", false);
      res.set(response.httpProps);
      res.status(201).send();
    });
  }
}

export default new PutBlob();
