import storageManager from "./../../core/blob/StorageManager";

class SetContainerAcl {
  public process(request, res) {
    storageManager.setContainerAcl(request).then(response => {
      res.set(response.httpProps);
      res.status(200).send();
    });
  }
}

export default new SetContainerAcl();
