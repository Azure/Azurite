import * as js2xmlparser from "js2xmlparser";
import storageManager from "./../../core/blob/StorageManager";

class GetBlobServiceProperties {
  public process(request, res) {
    storageManager.getBlobServiceProperties(request).then(response => {
      const xml = js2xmlparser.parse(
        "StorageServiceProperties",
        response.payload.StorageServiceProperties || []
      );
      res.set(response.httpProps);
      res.status(200).send(xml);
    });
  }
}

export default new GetBlobServiceProperties();
