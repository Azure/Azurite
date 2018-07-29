const AzuriteTableResponse = require("./../../model/table/AzuriteTableResponse"),
  ODataMode = require("./../../core/Constants").ODataMode,
  tableStorageManager = require("./../../core/table/TableStorageManager");

class QueryEntities {
  constructor() {}

  process(request, res) {
    tableStorageManager.queryEntities(request).then(response => {
      res.set(response.httpProps);
      const payload = this._createResponsePayload(
        response.payload,
        request.tableName,
        request.accept
      );
      res.status(200).send(payload);
    });
  }

  _createResponsePayload(payload, tableName, accept) {
    const response = {};
    if (accept !== ODataMode.NONE) {
      response[
        "odata.metadata"
      ] = `http://127.0.0.1:10002/devstoreaccount1/$metadata#${tableName}`;
    }
    response.value = [];
    let i = 0;
    for (const item of payload) {
      response.value.push(item.attribs(accept));
      response.value[i]["PartitionKey"] = item.partitionKey;
      response.value[i]["RowKey"] = item.rowKey;
      if (accept === ODataMode.FULL) {
        const odataItems = item.odata(accept);
        for (const key of odataItems) {
          response.value[i][key] = odataItems[key];
        }
        delete response.value[i]["odata.metadata"];
      }
      ++i;
    }
    return response;
  }
}

export default new QueryEntities();
