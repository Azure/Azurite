import AzuriteBlobResponse from "../../model/blob/AzuriteBlobResponse";
import StorageManager from "./../../core/blob/StorageManager";
import N from "./../../core/HttpHeaderNames";

class PutPage {
  public process(request, res) {
    StorageManager.putPage(request).then((response: AzuriteBlobResponse) => {
      response.addHttpProperty(N.REQUEST_SERVER_ENCRYPTED, false);
      res.set(response.httpProps);
      res.status(201).send();
    });
  }
}

export default new PutPage();
