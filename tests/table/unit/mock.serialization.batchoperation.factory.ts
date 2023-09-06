import TableBatchOperation from "../../../src/table/batch/TableBatchOperation";

export default class SerializationBatchOperationFactory {
  // These values are hard coded to the request string
  public static GetBatchOperationMockForQueryEntityWithPartitionKeyAndRowKey(
    headers: string
  ): TableBatchOperation {
    const operation = new TableBatchOperation(headers);
    operation.httpMethod = "GET";
    operation.jsonRequestBody = "";
    operation.parameters = "";
    operation.path = "table161289070041408231";
    operation.protocol = "";
    operation.rawHeaders = [
      "HTTP/1.1",
      "accept: application/json;odata=minimalmetadata",
      "maxdataserviceversion: 3.0;NetFx",
      "",
      ""
    ];
    operation.uri =
      "http://127.0.0.1:11002/devstoreaccount1/table161289070041408231(PartitionKey=%27part1%27,RowKey=%27row16128907004690459%27)";
    return operation;
  }

  public static GetBatchOperationMockForInsertSingleEntity(
    headers: string
  ): TableBatchOperation {
    const operation = new TableBatchOperation(headers);
    operation.httpMethod = "PUT";
    operation.jsonRequestBody = "";
    operation.parameters = "";
    operation.path = "table161289070041408231";
    operation.protocol = "";
    operation.jsonRequestBody =
      '{"PartitionKey":"part1","RowKey":"row161311975544100305","myValue":"value1"}';
    operation.rawHeaders = [
      "HTTP/1.1",
      "content-length: 76",
      "content-type: application/json;type=entry",
      "accept: application/json;odata=minimalmetadata",
      "maxdataserviceversion: 3.0;NetFx",
      "",
      ""
    ];
    operation.uri =
      "http://127.0.0.1:11002/devstoreaccount1/table161311975539604802";
    return operation;
  }

  public static GetBatchOperationMockForDeleteSingleEntity(
    headers: string
  ): TableBatchOperation {
    const operation = new TableBatchOperation(headers);
    operation.httpMethod = "DELETE";
    operation.jsonRequestBody = "";
    operation.parameters = "";
    operation.path = "table161314571276801774";
    operation.protocol = "";
    operation.jsonRequestBody = "";
    // ToDo: Check behaviour without empty headers
    operation.rawHeaders = [
      "HTTP/1.1",
      "if-match: *",
      "accept: application/json;odata=minimalmetadata",
      "maxdataserviceversion: 3.0;NetFx",
      "",
      ""
    ];
    operation.uri =
      "http://127.0.0.1:11002/devstoreaccount1/table161314571276801774(PartitionKey=%27part1%27,RowKey=%27row161314571280802822%27)";
    return operation;
  }
}
