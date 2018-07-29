const storageManager = require("./../../core/blob/StorageManager");

class GetContainerMetadata {
  constructor() {}

  process(request, res) {
    storageManager.getContainerMetadata(request).then(response => {
      res.set(response.httpProps);
      res.status(200).send();
    });
  }
}

export default new GetContainerMetadata();
