// These are the strings we get from within VS Code when we debug a request to the service
// Full request includes batch boundaries
// Partial is only the inner batch response from the serializer
// we need to use prettier ignore to avoid it messing with the formatting of the Etag and other escaped values
export default class SerializationResponseMockStrings {
  // ####################
  // Mocks for Query with Partition Key and Row Key
  // ####################
  public static FullBatchQueryWithPartitionKeyAndRowKeyResponse: string =
    '\
--batchresponse_5f4cfbb9-f5fa-45f1-9c9b-04e2436cbf9a\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nHTTP/1.1 200 OK\r\nDataServiceVersion: 3.0;\r\nContent-Type: application/json;odata=minimalmetadata;streaming=true;charset=utf-8\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-cache\r\nETag: W/"datetime\'2021-02-05T17%3A15%3A16.7935715Z\'"\r\n\r\n{"odata.metadata":"https://azuritetesttarget.table.core.windows.net/$metadata#TestingAzurite/@Element","odata.etag":"W/"datetime\'2021-02-05T17%3A15%3A16.7935715Z\'"","PartitionKey":"part1","RowKey":"row161254531681303585","Timestamp":"2021-02-05T17:15:16.7935715Z","myValue":"value1"}\r\n--batchresponse_5f4cfbb9-f5fa-45f1-9c9b-04e2436cbf9a--\r\n\
';

  public static EmptyHeaderMock: string = "";

  public static PartialBatchQueryWithPartitionKeyAndRowKeyResponse: string =
    '\
Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nHTTP/1.1 200 OK\r\nDataServiceVersion: 3.0;\r\nContent-Type: application/json;odata=minimalmetadata;streaming=true;charset=utf-8\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-cache\r\nETag: W/"datetime\'2021-02-05T17%3A15%3A16.7935715Z\'"\r\n\r\n{"odata.metadata":"https://azuritetesttarget.table.core.windows.net/$metadata#TestingAzurite/@Element","odata.etag":"W/"datetime\'2021-02-05T17%3A15%3A16.7935715Z\'"","PartitionKey":"part1","RowKey":"row161254531681303585","Timestamp":"2021-02-05T17:15:16.7935715Z","myValue":"value1"}\r\n\
';

  // ####################
  // Mocks for Single Batch Insert or Replace
  // ####################
  public static FullBatchSingleInsertOrReplaceResponseString: string =
    // "--batchresponse_247e73cd-0e49-4854-8aad-3badc34b3381\r\nContent-Type: multipart/mixed; boundary=changesetresponse_8ddf8e68-ca51-45bd-8c65-95fe1cc94164\r\n\r\n--changesetresponse_8ddf8e68-ca51-45bd-8c65-95fe1cc94164\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nHTTP/1.1 204 No Content\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-cache\r\nDataServiceVersion: 1.0;\r\nETag: W/\"datetime'2021-02-12T08%3A28%3A27.47468Z'\"\r\n\r\n\r\n--changesetresponse_8ddf8e68-ca51-45bd-8c65-95fe1cc94164--\r\n--batchresponse_247e73cd-0e49-4854-8aad-3badc34b3381--\r\n"
    // prettier-ignore
    "--batchresponse_247e73cd-0e49-4854-8aad-3badc34b3381\r\nContent-Type: multipart/mixed; boundary=changesetresponse_8ddf8e68-ca51-45bd-8c65-95fe1cc94164\r\n\r\n--changesetresponse_8ddf8e68-ca51-45bd-8c65-95fe1cc94164\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nHTTP/1.1 204 No Content\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-cache\r\nDataServiceVersion: 1.0;\r\nETag: W/\"datetime'2021-02-12T08%3A28%3A27.47468Z'\"\r\n\r\n\r\n--changesetresponse_8ddf8e68-ca51-45bd-8c65-95fe1cc94164--\r\n--batchresponse_247e73cd-0e49-4854-8aad-3badc34b3381--\r\n";

  // manually changed to +DataServiceVersion: 3.0;
  // Azure responds with +DataServiceVersion: 1.0 right now
  public static PartialBatchSingleInsertOrReplaceResponseString: string =
    // prettier-ignore
    "Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nHTTP/1.1 204 No Content\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-cache\r\nDataServiceVersion: 3.0;\r\nETag: W/\"datetime'2021-02-12T08%3A28%3A27.47468Z'\"\r\n";

  // ####################
  // Mocks for Single Batch Delete
  // ####################
  // "--batchresponse_5920f66b-704c-4f0d-a1ba-a024f44e4754\r\nContent-Type: multipart/mixed; boundary=changesetresponse_a3dab894-5e6c-4f3d-877e-dc918125467e\r\n\r\n--changesetresponse_a3dab894-5e6c-4f3d-877e-dc918125467e\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nHTTP/1.1 204 No Content\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-cache\r\nDataServiceVersion: 1.0;\r\n\r\n\r\n--changesetresponse_a3dab894-5e6c-4f3d-877e-dc918125467e--\r\n--batchresponse_5920f66b-704c-4f0d-a1ba-a024f44e4754--\r\n"
  public static FullBatchSingleDeleteResponseString: string =
    // pretier-ignore
    "--batchresponse_5920f66b-704c-4f0d-a1ba-a024f44e4754\r\nContent-Type: multipart/mixed; boundary=changesetresponse_a3dab894-5e6c-4f3d-877e-dc918125467e\r\n\r\n--changesetresponse_a3dab894-5e6c-4f3d-877e-dc918125467e\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nHTTP/1.1 204 No Content\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-cache\r\nDataServiceVersion: 1.0;\r\n\r\n\r\n--changesetresponse_a3dab894-5e6c-4f3d-877e-dc918125467e--\r\n--batchresponse_5920f66b-704c-4f0d-a1ba-a024f44e4754--\r\n";

  // manually set dataserviceversion to 3.0, service responds with 1.0
  public static PartialBatchSingleDeleteResponseString: string =
    // pretier-ignore
    "Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nHTTP/1.1 204 No Content\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-cache\r\nDataServiceVersion: 3.0;\r\n";

  // ####################
  // Mocks for Multiple Batch Insert or Replace
  // ####################
}
