const AzuriteTableResponse = from "./../../model/table/AzuriteTableResponse"),
  tableStorageManager = from "./../../core/table/TableStorageManager"),
  ODataMode = from "./../../core/Constants").ODataMode;
import N from "./../../core/HttpHeaderNames";

class QueryTable {
  public process(request, res) {
    tableStorageManager.queryTable(request).then(response => {
      res.set(response.httpProps);
      const payload = this._createResponsePayload(
        response.payload,
        request.accept
      );
      res.status(200).send(payload);
    });
  }

  public _createResponsePayload(payload, accept) {
    const response = {};
    if (accept !== ODataMode.NONE) {
      response[
        "odata.metadata"
      ] = `http://127.0.0.1:10002/devstoreaccount1/$metadata#Tables`;
    }
    response.value = [];
    let i = 0;
    for (const item of payload) {
      response.value.push(item.odata(accept));
      delete response.value[i]["odata.metadata"];
      ++i;
    }
    return response;
  }
}

export default new QueryTable();
