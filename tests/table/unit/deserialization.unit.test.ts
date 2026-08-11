// Unit Tests for serialization
import * as assert from "assert";
import BatchRequestHeaders from "../../../src/table/batch/BatchRequestHeaders";
import { BatchSerialization } from "../../../src/table/batch/BatchSerialization";
import { TableBatchSerialization } from "../../../src/table/batch/TableBatchSerialization";
import SerializationRequestMockStrings from "./mock.request.serialization.strings";

describe("batch deserialization unit tests, these are not the API integration tests:", () => {
  it("deserializes, mock table batch request containing 3 insert requests correctly", (done) => {
    const requestString =
      SerializationRequestMockStrings.Sample3InsertsUsingSDK;
    const serializer = new TableBatchSerialization();
    const batchOperationArray =
      serializer.deserializeBatchRequest(requestString);

    assert.strictEqual(
      batchOperationArray.length,
      3,
      "failed to deserialize correct number of operations"
    );
    assert.strictEqual(
      batchOperationArray[0].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].path,
      "table160837408807101776",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837408807101776",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].jsonRequestBody,
      '{"PartitionKey":"part1","RowKey":"row160837408812000231","myValue":"value1"}',
      "wrong jsonBody parsed"
    );
    // Second Batch Operation
    assert.strictEqual(
      batchOperationArray[1].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].path,
      "table160837408807101776",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837408807101776",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].jsonRequestBody,
      '{"PartitionKey":"part1","RowKey":"row160837408812008370","myValue":"value1"}',
      "wrong jsonBody parsed"
    );
    // Third Batch Operation
    assert.strictEqual(
      batchOperationArray[2].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[2].path,
      "table160837408807101776",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[2].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837408807101776",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[2].jsonRequestBody,
      '{"PartitionKey":"part1","RowKey":"row160837408812003154","myValue":"value1"}',
      "wrong jsonBody parsed"
    );
    done();
  });

  it("deserializes, mock table batch request containing a query correctly", (done) => {
    const requestString = SerializationRequestMockStrings.Sample1QueryUsingSDK;
    const serializer = new TableBatchSerialization();
    const batchOperationArray =
      serializer.deserializeBatchRequest(requestString);

    // this first test is currently a stupid test, as I control the type within the code
    // we want to test that we have deserialized the operation.
    assert.strictEqual(
      batchOperationArray[0].httpMethod,
      "GET",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].path,
      "table160837567141205013",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837567141205013(PartitionKey=%27part1%27,RowKey=%27row160837567145205850%27)",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].jsonRequestBody,
      "",
      "wrong jsonBody parsed"
    );
    done();
  });

  it("deserializes, mock table batch request containing insert and merge correctly", (done) => {
    const requestString =
      SerializationRequestMockStrings.SampleInsertThenMergeUsingSDK;
    const serializer = new TableBatchSerialization();
    const batchOperationArray =
      serializer.deserializeBatchRequest(requestString);

    // First Batch Operation is an insert.
    assert.strictEqual(
      batchOperationArray[0].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].path,
      "table160837770303307822",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837770303307822",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].jsonRequestBody,
      '{"PartitionKey":"part1","RowKey":"row160837770307508823","myValue":"value2"}',
      "wrong jsonBody parsed"
    );
    // Second Batch Operation is a merge
    assert.strictEqual(
      batchOperationArray[1].httpMethod,
      "MERGE",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].path,
      "table160837770303307822",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837770303307822(PartitionKey=%27part1%27,RowKey=%27row160837770307508823%27)",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].jsonRequestBody,
      '{"PartitionKey":"part1","RowKey":"row160837770307508823","myValue":"valueMerge"}',
      "wrong jsonBody parsed"
    );
    done();
  });

  it("deserializes, mock table batch request containing 3 deletes correctly", (done) => {
    const requestString =
      SerializationRequestMockStrings.Sample3DeletesUsingSDK;
    const serializer = new TableBatchSerialization();
    const batchOperationArray =
      serializer.deserializeBatchRequest(requestString);

    // First Batch Operation is an insert.
    assert.strictEqual(
      batchOperationArray[0].httpMethod,
      "DELETE",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].path,
      "table161216830457901592",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table161216830457901592(PartitionKey=%27part1%27,RowKey=%27row161216830462208585%27)",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].jsonRequestBody,
      "",
      "wrong jsonBody parsed"
    );
    // Second Batch Operation is a Delete
    assert.strictEqual(
      batchOperationArray[1].httpMethod,
      "DELETE",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].path,
      "table161216830457901592",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table161216830457901592(PartitionKey=%27part1%27,RowKey=%27row161216830462204546%27)",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].jsonRequestBody,
      "",
      "wrong jsonBody parsed"
    );
    done();
  });

  it("deserializes, mock durable function request correctly", (done) => {
    const requestString =
      SerializationRequestMockStrings.BatchDurableE1HelloRequestString;
    const serializer = new TableBatchSerialization();
    const batchOperationArray =
      serializer.deserializeBatchRequest(requestString);

    // There are 5 operations in the batch
    assert.strictEqual(batchOperationArray.length, 5);
    done();
  });

  // boundary tests
  it("finds the \\r\\n line ending boundary in a durable functions call", (done) => {
    const serializationBase = new BatchSerialization();
    // extract batchBoundary
    serializationBase.extractLineEndings(
      SerializationRequestMockStrings.BatchDurableE1HelloRequestString
    );
    assert.strictEqual(serializationBase.lineEnding, "\r\n");
    done();
  });

  it("finds the \\n line ending boundary in an SDK call", (done) => {
    const serializationBase = new BatchSerialization();
    // extract batchBoundary
    serializationBase.extractLineEndings(
      SerializationRequestMockStrings.Sample3InsertsUsingSDK
    );
    assert.strictEqual(serializationBase.lineEnding, "\n");
    done();
  });

  it("finds the batch boundary in a durable functions call", (done) => {
    const serializationBase = new BatchSerialization();
    // extract batchBoundary
    serializationBase.extractBatchBoundary(
      SerializationRequestMockStrings.BatchDurableE1HelloRequestString
    );
    assert.strictEqual(
      serializationBase.batchBoundary,
      "--batch_35c74636-e91e-4c4f-9ab1-906881bf7d9d"
    );
    done();
  });

  it("finds the changeset boundary in a durable functions call", (done) => {
    const serializationBase = new BatchSerialization();
    serializationBase.extractChangeSetBoundary(
      SerializationRequestMockStrings.BatchDurableE1HelloRequestString
    );
    assert.strictEqual(
      serializationBase.changesetBoundary,
      "changeset_0ac4036e-9ea9-4dfc-90c3-66a95213b6b0"
    );
    done();
  });

  it("finds the batch boundary in a single retrieve entity call", (done) => {
    const serializationBase = new BatchSerialization();
    // extract batchBoundary
    serializationBase.extractBatchBoundary(
      SerializationRequestMockStrings.BatchQueryWithPartitionKeyAndRowKeyRequest
    );
    assert.strictEqual(
      serializationBase.batchBoundary,
      "--batch_d54a6553104c5b65f259aa178d324ebf"
    );
    done();
  });

  it("finds the changeset boundary in a single retrieve entity call", (done) => {
    const serializationBase = new BatchSerialization();
    serializationBase.extractChangeSetBoundary(
      SerializationRequestMockStrings.BatchQueryWithPartitionKeyAndRowKeyRequest
    );
    assert.strictEqual(
      serializationBase.changesetBoundary,
      "--batch_d54a6553104c5b65f259aa178d324ebf"
    );
    done();
  });

  it("finds the changeset boundary in a non guid form", (done) => {
    const serializationBase = new BatchSerialization();
    serializationBase.extractChangeSetBoundary(
      SerializationRequestMockStrings.BatchNonGuidBoundaryShortString
    );
    assert.strictEqual(serializationBase.changesetBoundary, "blahblah");
    done();
  });

  it("deserializes the headers correctly for a batch request", (done) => {
    const sampleHeaders = [
      "HTTP/1.1\r",
      "Accept: application/json;odata=minimalmetadata\r",
      "Content-Type: application/json\r",
      "Prefer: return-no-content\r",
      "DataServiceVersion: 3.0;\r",
      "\r",
      ""
    ];
    // const headers1 = new BatchRequestHeaders(sampleHeaders1);
    const headers = new BatchRequestHeaders(sampleHeaders);
    assert.strictEqual(headers.header("prefer"), "return-no-content");
    done();
  });

  it("correctly parses paths from URIs", (done) => {
    // Account must be alphanumeric, and between 3 and 24 chars long
    // Table name must be alphanumeric, cannot begin with a number,
    // and must be between 3 and 63 characters long
    const uris = [
      {
        uri: "http://127.0.0.1:10002/queuesdev/funcpcappdevHistory(PartitionKey='2d2c8fe4-d3a6-438f-aa83-382d93ee9569:ca',RowKey='0000000000000000')",
        path: "/queuesdev/funcpcappdevHistory"
      },
      {
        uri: "http://127.0.0.1:10002/devaccountstore1/myTable(PartitionKey='1',RowKey='1ab')",
        path: "/devaccountstore1/myTable"
      },
      {
        uri: "http://127.0.0.1:9999/my1accountstore99/my1Table(PartitionKey='2',RowKey='2')",
        path: "/my1accountstore99/my1Table"
      },
      {
        uri: "http://127.0.0.1:9999/my1/my1Table9999999999999999999999999999999999999999999999999qw9999(PartitionKey='2',RowKey='2')",
        path: "/my1/my1Table9999999999999999999999999999999999999999999999999qw9999"
      }
    ];

    const serializationBase = new BatchSerialization();
    uris.forEach((value) => {
      const extractedPath = serializationBase.extractPath(value.uri);
      if (extractedPath !== null) {
        assert.strictEqual(
          extractedPath[0],
          value.path,
          "URI path did not parse correctly!"
        );
      } else {
        assert.notStrictEqual(
          null,
          extractedPath,
          "Unable to extract path, regex did not match!"
        );
      }
    });
    done();
  });

  it("deserializes, mock table batch request from Go SDK containing 2 inserts correctly", (done) => {
    const requestString =
      SerializationRequestMockStrings.BatchGoSDKInsertRequestString1;
    const serializer = new TableBatchSerialization();
    const batchOperationArray =
      serializer.deserializeBatchRequest(requestString);

    assert.strictEqual(
      batchOperationArray.length,
      2,
      "We did not deserialize all operations!"
    );
    // First Batch Operation is an insert.
    assert.strictEqual(
      batchOperationArray[0].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].path,
      "testTable",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].uri?.toString() ===
        "http://127.0.0.1:10002/devstoreaccount1/testTable",
      true,
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].jsonRequestBody,
      '{"PartitionKey":"uuid","RowKey":"rkey1","price":5,"product":"product1"}',
      "wrong jsonBody parsed"
    );
    // Second Batch Operation is an insert
    assert.strictEqual(
      batchOperationArray[1].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].path,
      "testTable",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].uri?.toString() ===
        "http://127.0.0.1:10002/devstoreaccount1/testTable",
      true,
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].jsonRequestBody,
      '{"PartitionKey":"uuid","RowKey":"rkey2","price":10,"product":"product2"}',
      "wrong jsonBody parsed"
    );
    done();
  });

  it("deserializes, mock table batch request from Go SDK containing more complex URL correctly", (done) => {
    const requestString =
      SerializationRequestMockStrings.BatchGoSDKInsertRequestString2;
    const serializer = new TableBatchSerialization();
    const batchOperationArray =
      serializer.deserializeBatchRequest(requestString);

    assert.strictEqual(
      batchOperationArray.length,
      2,
      "We did not deserialize all operations!"
    );
    // First Batch Operation is an insert.
    assert.strictEqual(
      batchOperationArray[0].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].path,
      "TestTable",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].uri?.toString() ===
        "http://127.0.0.1:10002/devstoreaccount1/TestTable?%24format=application%2Fjson%3Bodata%3Dminimalmetadata",
      true,
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].jsonRequestBody,
      '{"PartitionKey":"5cad691a-3fb3-4016-8061-9a18fd8dea4a","RowKey":"rkey1","product":"product1"}',
      "wrong jsonBody parsed"
    );
    // Second Batch Operation is an insert
    assert.strictEqual(
      batchOperationArray[1].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].path,
      "TestTable",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].uri?.toString() ===
        "http://127.0.0.1:10002/devstoreaccount1/TestTable?%24format=application%2Fjson%3Bodata%3Dminimalmetadata",
      true,
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].jsonRequestBody,
      '{"PartitionKey":"5cad691a-3fb3-4016-8061-9a18fd8dea4a","RowKey":"rkey2","product":"product2"}',
      "wrong jsonBody parsed"
    );
    done();
  });

  it("deserializes, mock table batch request containing 4 \\n\\n deletes correctly", (done) => {
    const requestString =
      SerializationRequestMockStrings.BatchFuncToolsDeleteString;
    const serializer = new TableBatchSerialization();
    const batchOperationArray =
      serializer.deserializeBatchRequest(requestString);

    // First Batch Operation is a Delete.
    assert.strictEqual(
      batchOperationArray[0].httpMethod,
      "DELETE",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].path,
      "TestHubNameHistory",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].uri,
      "http://127.0.0.1:10002/devstoreaccount1/TestHubNameHistory(PartitionKey='00000000EDGC5674',RowKey='0000000000000000')",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].jsonRequestBody,
      "",
      "wrong jsonBody parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].rawHeaders[4],
      "If-Match: W/\"datetime'2023-03-17T15%3A06%3A18.3075721Z'\"",
      "wrong Etag parsed"
    );
    // Third Batch Operation is a Delete
    assert.strictEqual(
      batchOperationArray[2].httpMethod,
      "DELETE",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[2].path,
      "TestHubNameHistory",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[2].uri,
      "http://127.0.0.1:10002/devstoreaccount1/TestHubNameHistory(PartitionKey='00000000EDGC5674',RowKey='0000000000000002')",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[2].jsonRequestBody,
      "",
      "wrong jsonBody parsed"
    );
    assert.strictEqual(
      batchOperationArray[2].rawHeaders[4],
      "If-Match: W/\"datetime'2023-03-17T15%3A06%3A18.3075737Z'\"",
      "wrong Etag parsed"
    );
    done();
  });

  it("deserializes, mock table batch request containing 2 \\r\\n\\r\\n deletes correctly", (done) => {
    const requestString =
      SerializationRequestMockStrings.BatchCloudNetDeleteString;
    const serializer = new TableBatchSerialization();
    const batchOperationArray =
      serializer.deserializeBatchRequest(requestString);

    // First Batch Operation is a Delete.
    assert.strictEqual(
      batchOperationArray[0].httpMethod,
      "DELETE",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].path,
      "GatewayManagerInventoryTable",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].uri,
      "http://127.0.0.1:10002/devstoreaccount1/GatewayManagerInventoryTable(PartitionKey='0',RowKey='device_0_device1')",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].jsonRequestBody,
      "",
      "wrong jsonBody parsed"
    );
    assert.strictEqual(
      batchOperationArray[0].rawHeaders[4],
      "If-Match: W/\"datetime'2022-07-19T15%3A36%3A46.297987Z'\"",
      "wrong Etag parsed"
    );
    // Second Batch Operation is a Delete
    assert.strictEqual(
      batchOperationArray[1].httpMethod,
      "DELETE",
      "wrong HTTP Method parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].path,
      "GatewayManagerInventoryTable",
      "wrong path parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].uri,
      "http://127.0.0.1:10002/devstoreaccount1/GatewayManagerInventoryTable(PartitionKey='0',RowKey='devicelocationmap_0_sanjose_0_device1')",
      "wrong url parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].jsonRequestBody,
      "",
      "wrong jsonBody parsed"
    );
    assert.strictEqual(
      batchOperationArray[1].rawHeaders[4],
      "If-Match: W/\"datetime'2022-07-19T15%3A36%3A46.297103Z'\"",
      "wrong Etag parsed"
    );
    done();
  });
});
