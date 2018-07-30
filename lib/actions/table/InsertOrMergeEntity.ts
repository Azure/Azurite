import N from "./../../core/HttpHeaderNames";
import tableStorageManager from "./../../core/table/TableStorageManager";

class InsertOrMergeEntity {
  public process(request, res) {
    tableStorageManager.insertOrMergeEntity(request).then(response => {
      response.addHttpProperty(N.ETAG, response.proxy.etag);
      res.set(response.httpProps);
      res.status(204).send();
    });
  }
}

export default new InsertOrMergeEntity();
