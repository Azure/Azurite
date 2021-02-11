import { BatchType } from "../../../src/common/batch/BatchOperation";
import TableBatchOperation from "../../../src/table/batch/TableBatchOperation";

export default class SerializationBatchOperationFactory {
  // These values are hard coded to the request string
  public static GetBatchOperationMockForQueryEntityWithPartitionKeyAndRowKey(
    headers: string
  ): TableBatchOperation {
    const operation = new TableBatchOperation(BatchType.table, headers);
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
}
