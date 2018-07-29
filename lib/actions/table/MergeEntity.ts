const AzuriteTableResponse = from "./../../model/table/AzuriteTableResponse"),
  tableStorageManager = from "./../../core/table/TableStorageManager"),
  ODataMode = from "./../../core/Constants").ODataMode;
import N from "./../../core/HttpHeaderNames";

class MergeEntity {
  public process(request, res) {
    tableStorageManager.mergeEntity(request).then(response => {
      response.addHttpProperty(N.ETAG, response.proxy.etag);
      res.set(response.httpProps);
      res.status(204).send();
    });
  }
}

export default new MergeEntity();
