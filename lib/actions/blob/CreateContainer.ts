import storageManager from "./../../core/blob/StorageManager";

class CreateContainer {
  public process(azuriteRequest, res) {
    storageManager.createContainer(azuriteRequest).then(response => {
      res.set(response.httpProps);
      res.status(201).send();
    });
  }
}

export default new CreateContainer();
