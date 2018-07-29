import storageManager from "./../../core/blob/StorageManager";

class SetBlobServiceProperties {
  public process(request, res) {
    storageManager.setBlobServiceProperties(request).then(response => {
      res.set(response.httpProps);
      res.status(202).send();
    });
  }
}

export default new SetBlobServiceProperties();
