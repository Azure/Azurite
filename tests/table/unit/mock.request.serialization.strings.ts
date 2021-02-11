// Contains Mocks for Serialization Tests

export default class SerializationRequestMockStrings {
  public static TableBatchRequestMimeBodyString: string =
    '\
--batch_a1e9d677-b28b-435e-a89e-87e6a768a431\n\
Content-Type: multipart/mixed; boundary=changeset_8a28b620-b4bb-458c-a177-0959fb14c977\n\
\n\
--changeset_8a28b620-b4bb-458c-a177-0959fb14c977\n\
Content-Type: application/http\n\
Content-Transfer-Encoding: binary\n\
\n\
POST https://myaccount.table.core.windows.net/Blogs HTTP/1.1\n\
Content-Type: application/json\n\
Accept: application/json;odata=minimalmetadata\n\
Prefer: return-no-content\n\
DataServiceVersion: 3.0;\n\
\n\
{"PartitionKey":"Channel_19", "RowKey":"1", "Rating":9, "Text":".NET..."}\n\
--changeset_8a28b620-b4bb-458c-a177-0959fb14c977\n\
Content-Type: application/http\n\
Content-Transfer-Encoding: binary\n\
\n\
POST https://myaccount.table.core.windows.net/Blogs HTTP/1.1\n\
Content-Type: application/json\n\
Accept: application/json;odata=minimalmetadata\n\
Prefer: return-no-content\n\
DataServiceVersion: 3.0;\n\
\n\
{"PartitionKey":"Channel_17", "RowKey":"2", "Rating":9, "Text":"Azure..."}\n\
--changeset_8a28b620-b4bb-458c-a177-0959fb14c977\n\
Content-Type: application/http\n\
Content-Transfer-Encoding: binary\
\n\
MERGE https://myaccount.table.core.windows.net/Blogs(PartitionKey=\'Channel_17\', RowKey=\'3\') HTTP/1.1\n\
Content-Type: application/json\n\
Accept: application/json;odata=minimalmetadata\n\
DataServiceVersion: 3.0;\n\
\n\
{"PartitionKey":"Channel_19", "RowKey":"3", "Rating":9, "Text":"PDC 2008..."}\n\
\n\
--changeset_8a28b620-b4bb-458c-a177-0959fb14c977--\n\
--batch_a1e9d677-b28b-435e-a89e-87e6a768a431\n\
';

  public static Sample3InsertsUsingSDK: string =
    '\
    --batch_7679a9f9b2dde130e791580c53508a5a\ncontent-type: multipart/mixed;charset="utf-8";boundary=changeset_7679a9f9b2dde130e791580c53508a5a\n\n--changeset_7679a9f9b2dde130e791580c53508a5a\ncontent-type: application/http\ncontent-transfer-encoding: binary\n\nPOST http://127.0.0.1:11002/devstoreaccount1/table160837408807101776 HTTP/1.1\nPrefer: return-content\ncontent-length: 76\ncontent-type: application/json;type=entry\naccept: application/json;odata=minimalmetadata\nmaxdataserviceversion: 3.0;NetFx\n\n{"PartitionKey":"part1","RowKey":"row160837408812000231","myValue":"value1"}\n--changeset_7679a9f9b2dde130e791580c53508a5a\ncontent-type: application/http\ncontent-transfer-encoding: binary\n\nPOST http://127.0.0.1:11002/devstoreaccount1/table160837408807101776 HTTP/1.1\nPrefer: return-content\ncontent-length: 76\ncontent-type: application/json;type=entry\naccept: application/json;odata=minimalmetadata\nmaxdataserviceversion: 3.0;NetFx\ncontent-id: 1\n\n{"PartitionKey":"part1","RowKey":"row160837408812008370","myValue":"value1"}\n--changeset_7679a9f9b2dde130e791580c53508a5a\ncontent-type: application/http\ncontent-transfer-encoding: binary\n\nPOST http://127.0.0.1:11002/devstoreaccount1/table160837408807101776 HTTP/1.1\nPrefer: return-content\ncontent-length: 76\ncontent-type: application/json;type=entry\naccept: application/json;odata=minimalmetadata\nmaxdataserviceversion: 3.0;NetFx\ncontent-id: 2\n\n{"PartitionKey":"part1","RowKey":"row160837408812003154","myValue":"value1"}\n--changeset_7679a9f9b2dde130e791580c53508a5a--\n--batch_7679a9f9b2dde130e791580c53508a5a--\
';

  public static Sample1QueryUsingSDK: string =
    "\
--batch_d737e1b79cb362526a8b4a13d46d6fc3\ncontent-type: application/http\ncontent-transfer-encoding: binary\n\nGET http://127.0.0.1:11002/devstoreaccount1/table160837567141205013(PartitionKey=%27part1%27,RowKey=%27row160837567145205850%27) HTTP/1.1\naccept: application/json;odata=minimalmetadata\nmaxdataserviceversion: 3.0;NetFx\n\n--batch_d737e1b79cb362526a8b4a13d46d6fc3--\
";

  public static SampleInsertThenMergeUsingSDK: string =
    '\
--batch_aa71f86e6ed5d85b178b2a28cbb61f97\ncontent-type: multipart/mixed;charset="utf-8";boundary=changeset_aa71f86e6ed5d85b178b2a28cbb61f97\n\n--changeset_aa71f86e6ed5d85b178b2a28cbb61f97\ncontent-type: application/http\ncontent-transfer-encoding: binary\n\nPOST http://127.0.0.1:11002/devstoreaccount1/table160837770303307822 HTTP/1.1\nPrefer: return-content\ncontent-length: 76\ncontent-type: application/json;type=entry\naccept: application/json;odata=minimalmetadata\nmaxdataserviceversion: 3.0;NetFx\n\n{"PartitionKey":"part1","RowKey":"row160837770307508823","myValue":"value2"}\n--changeset_aa71f86e6ed5d85b178b2a28cbb61f97\ncontent-type: application/http\ncontent-transfer-encoding: binary\n\nMERGE http://127.0.0.1:11002/devstoreaccount1/table160837770303307822(PartitionKey=%27part1%27,RowKey=%27row160837770307508823%27) HTTP/1.1\nif-match: *\ncontent-length: 76\ncontent-type: application/json;type=entry\naccept: application/json;odata=minimalmetadata\nmaxdataserviceversion: 3.0;NetFx\ncontent-id: 1\n\n{"PartitionKey":"part1","RowKey":"row160837770307508823","myValue":"valueMerge"}\n--changeset_aa71f86e6ed5d85b178b2a28cbb61f97--\n--batch_aa71f86e6ed5d85b178b2a28cbb61f97--\
';

  public static Sample3DeletesUsingSDK: string =
    '\
--batch_2d60b21ff9edaf2bc1bc4f60664c0283\ncontent-type: multipart/mixed;charset="utf-8";boundary=changeset_2d60b21ff9edaf2bc1bc4f60664c0283\n\n--changeset_2d60b21ff9edaf2bc1bc4f60664c0283\ncontent-type: application/http\ncontent-transfer-encoding: binary\n\nDELETE http://127.0.0.1:11002/devstoreaccount1/table161216830457901592(PartitionKey=%27part1%27,RowKey=%27row161216830462208585%27) HTTP/1.1\nif-match: *\naccept: application/json;odata=minimalmetadata\nmaxdataserviceversion: 3.0;NetFx\n\n\n--changeset_2d60b21ff9edaf2bc1bc4f60664c0283\ncontent-type: application/http\ncontent-transfer-encoding: binary\n\nDELETE http://127.0.0.1:11002/devstoreaccount1/table161216830457901592(PartitionKey=%27part1%27,RowKey=%27row161216830462204546%27) HTTP/1.1\nif-match: *\naccept: application/json;odata=minimalmetadata\nmaxdataserviceversion: 3.0;NetFx\ncontent-id: 1\n\n\n--changeset_2d60b21ff9edaf2bc1bc4f60664c0283\ncontent-type: application/http\ncontent-transfer-encoding: binary\n\nDELETE http://127.0.0.1:11002/devstoreaccount1/table161216830457901592(PartitionKey=%27part1%27,RowKey=%27row161216830462201168%27) HTTP/1.1\nif-match: *\naccept: application/json;odata=minimalmetadata\nmaxdataserviceversion: 3.0;NetFx\ncontent-id: 2\n\n\n--changeset_2d60b21ff9edaf2bc1bc4f60664c0283--\n--batch_2d60b21ff9edaf2bc1bc4f60664c0283--\
';

  public static BatchQueryWithPartitionKeyAndRowKeyRequest: string =
    "\
--batch_d54a6553104c5b65f259aa178d324ebf\ncontent-type: application/http\ncontent-transfer-encoding: binary\n\nGET http://127.0.0.1:11002/devstoreaccount1/table161289070041408231(PartitionKey=%27part1%27,RowKey=%27row161289070046904593%27) HTTP/1.1\naccept: application/json;odata=minimalmetadata\nmaxdataserviceversion: 3.0;NetFx\n\n--batch_d54a6553104c5b65f259aa178d324ebf--\
";
}
