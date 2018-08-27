import storageManager from "./../../core/blob/StorageManager";

class GetContainerMetadata {
  public process(request, res) {
    storageManager.getContainerMetadata(request).then(response => {
      res.set(response.httpProps);
      res.status(200).send();
    });
  }
}

export default new GetContainerMetadata();
