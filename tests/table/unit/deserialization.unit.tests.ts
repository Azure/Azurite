// Unit Tests for serialization
import * as assert from "assert";
import { BatchType } from "../../../src/common/batch/BatchOperation";
import BatchRequestHeaders from "../../../src/common/batch/BatchRequestHeaders";
import { BatchSerialization } from "../../../src/common/batch/BatchSerialization";
import { TableBatchSerialization } from "../../../src/table/batch/TableBatchSerialization";
import SerializationRequestMockStrings from "./mock.request.serialization.strings";

describe("batch deserialization unit tests, these are not the API integration tests:", () => {
  it("deserializes, mock table batch request containing 3 insert requests correctly", (done) => {
    const requestString =
      SerializationRequestMockStrings.Sample3InsertsUsingSDK;
    const serializer = new TableBatchSerialization();
    const batchOperationArray = serializer.deserializeBatchRequest(
      requestString
    );

    assert.equal(
      batchOperationArray.length,
      3,
      "failed to deserialize correct number of operations"
    );
    assert.equal(batchOperationArray[0].batchType, BatchType.table);
    assert.equal(
      batchOperationArray[0].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.equal(
      batchOperationArray[0].path,
      "table160837408807101776",
      "wrong path parsed"
    );
    assert.equal(
      batchOperationArray[0].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837408807101776",
      "wrong url parsed"
    );
    assert.equal(
      batchOperationArray[0].jsonRequestBody,
      '{"PartitionKey":"part1","RowKey":"row160837408812000231","myValue":"value1"}',
      "wrong jsonBody parsed"
    );
    // Second Batch Operation
    assert.equal(batchOperationArray[1].batchType, BatchType.table);
    assert.equal(
      batchOperationArray[1].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.equal(
      batchOperationArray[1].path,
      "table160837408807101776",
      "wrong path parsed"
    );
    assert.equal(
      batchOperationArray[1].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837408807101776",
      "wrong url parsed"
    );
    assert.equal(
      batchOperationArray[1].jsonRequestBody,
      '{"PartitionKey":"part1","RowKey":"row160837408812008370","myValue":"value1"}',
      "wrong jsonBody parsed"
    );
    // Third Batch Operation
    assert.equal(batchOperationArray[2].batchType, BatchType.table);
    assert.equal(
      batchOperationArray[2].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.equal(
      batchOperationArray[2].path,
      "table160837408807101776",
      "wrong path parsed"
    );
    assert.equal(
      batchOperationArray[2].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837408807101776",
      "wrong url parsed"
    );
    assert.equal(
      batchOperationArray[2].jsonRequestBody,
      '{"PartitionKey":"part1","RowKey":"row160837408812003154","myValue":"value1"}',
      "wrong jsonBody parsed"
    );
    done();
  });

  it("deserializes, mock table batch request containing a query correctly", (done) => {
    const requestString = SerializationRequestMockStrings.Sample1QueryUsingSDK;
    const serializer = new TableBatchSerialization();
    const batchOperationArray = serializer.deserializeBatchRequest(
      requestString
    );

    // this first test is currently a stupid test, as I control the type within the code
    // we want to test that we have deserialized the operation.
    assert.equal(batchOperationArray[0].batchType, BatchType.table);
    assert.equal(
      batchOperationArray[0].httpMethod,
      "GET",
      "wrong HTTP Method parsed"
    );
    assert.equal(
      batchOperationArray[0].path,
      "table160837567141205013",
      "wrong path parsed"
    );
    assert.equal(
      batchOperationArray[0].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837567141205013(PartitionKey=%27part1%27,RowKey=%27row160837567145205850%27)",
      "wrong url parsed"
    );
    assert.equal(
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
    const batchOperationArray = serializer.deserializeBatchRequest(
      requestString
    );

    // First Batch Operation is an insert.
    assert.equal(batchOperationArray[0].batchType, BatchType.table);
    assert.equal(
      batchOperationArray[0].httpMethod,
      "POST",
      "wrong HTTP Method parsed"
    );
    assert.equal(
      batchOperationArray[0].path,
      "table160837770303307822",
      "wrong path parsed"
    );
    assert.equal(
      batchOperationArray[0].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837770303307822",
      "wrong url parsed"
    );
    assert.equal(
      batchOperationArray[0].jsonRequestBody,
      '{"PartitionKey":"part1","RowKey":"row160837770307508823","myValue":"value2"}',
      "wrong jsonBody parsed"
    );
    // Second Batch Operation is a merge
    assert.equal(batchOperationArray[1].batchType, BatchType.table);
    assert.equal(
      batchOperationArray[1].httpMethod,
      "MERGE",
      "wrong HTTP Method parsed"
    );
    assert.equal(
      batchOperationArray[1].path,
      "table160837770303307822",
      "wrong path parsed"
    );
    assert.equal(
      batchOperationArray[1].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table160837770303307822(PartitionKey=%27part1%27,RowKey=%27row160837770307508823%27)",
      "wrong url parsed"
    );
    assert.equal(
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
    const batchOperationArray = serializer.deserializeBatchRequest(
      requestString
    );

    // First Batch Operation is an insert.
    assert.equal(batchOperationArray[0].batchType, BatchType.table);
    assert.equal(
      batchOperationArray[0].httpMethod,
      "DELETE",
      "wrong HTTP Method parsed"
    );
    assert.equal(
      batchOperationArray[0].path,
      "table161216830457901592",
      "wrong path parsed"
    );
    assert.equal(
      batchOperationArray[0].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table161216830457901592(PartitionKey=%27part1%27,RowKey=%27row161216830462208585%27)",
      "wrong url parsed"
    );
    assert.equal(
      batchOperationArray[0].jsonRequestBody,
      "",
      "wrong jsonBody parsed"
    );
    // Second Batch Operation is a Delete
    assert.equal(batchOperationArray[1].batchType, BatchType.table);
    assert.equal(
      batchOperationArray[1].httpMethod,
      "DELETE",
      "wrong HTTP Method parsed"
    );
    assert.equal(
      batchOperationArray[1].path,
      "table161216830457901592",
      "wrong path parsed"
    );
    assert.equal(
      batchOperationArray[1].uri,
      "http://127.0.0.1:11002/devstoreaccount1/table161216830457901592(PartitionKey=%27part1%27,RowKey=%27row161216830462204546%27)",
      "wrong url parsed"
    );
    assert.equal(
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
    const batchOperationArray = serializer.deserializeBatchRequest(
      requestString
    );

    // There are 5 operations in the batch
    assert.equal(batchOperationArray.length, 5);
    // First Batch Operation is an insert.
    assert.equal(batchOperationArray[0].batchType, BatchType.table);

    done();
  });

  // boundary tests
  it("finds the \\r\\n line ending boundary in a durable functions call", (done) => {
    const serializationBase = new BatchSerialization();
    // extract batchBoundary
    serializationBase.extractLineEndings(
      SerializationRequestMockStrings.BatchDurableE1HelloRequestString
    );
    assert.equal(serializationBase.lineEnding, "\r\n");
    done();
  });

  it("finds the \\n line ending boundary in an SDK call", (done) => {
    const serializationBase = new BatchSerialization();
    // extract batchBoundary
    serializationBase.extractLineEndings(
      SerializationRequestMockStrings.Sample3InsertsUsingSDK
    );
    assert.equal(serializationBase.lineEnding, "\n");
    done();
  });

  it("finds the batch boundary in a durable functions call", (done) => {
    const serializationBase = new BatchSerialization();
    // extract batchBoundary
    serializationBase.extractBatchBoundary(
      SerializationRequestMockStrings.BatchDurableE1HelloRequestString
    );
    assert.equal(
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
    assert.equal(
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
    assert.equal(
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
    assert.equal(
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
    assert.equal(serializationBase.changesetBoundary, "blahblah");
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
    assert.equal(headers.header("prefer"), "return-no-content");
    done();
  });

  it("correctly parses paths from URIs", (done) => {
    // Account must be alphanumeric, and between 3 and 24 chars long
    // Table name must be alphanumeric, cannot begin with a number,
    // and must be between 3 and 63 characters long
    const uris = [
      {
        uri:
          "http://127.0.0.1:10002/queuesdev/funcpcappdevHistory(PartitionKey='2d2c8fe4-d3a6-438f-aa83-382d93ee9569:ca',RowKey='0000000000000000')",
        path: "/queuesdev/funcpcappdevHistory"
      },
      {
        uri:
          "http://127.0.0.1:10002/devaccountstore1/myTable(PartitionKey='1',RowKey='1ab')",
        path: "/devaccountstore1/myTable"
      },
      {
        uri:
          "http://127.0.0.1:9999/my1accountstore99/my1Table(PartitionKey='2',RowKey='2')",
        path: "/my1accountstore99/my1Table"
      },
      {
        uri:
          "http://127.0.0.1:9999/my1/my1Table9999999999999999999999999999999999999999999999999qw9999(PartitionKey='2',RowKey='2')",
        path:
          "/my1/my1Table9999999999999999999999999999999999999999999999999qw9999"
      }
    ];

    const serializationBase = new BatchSerialization();
    uris.forEach((value) => {
      const extractedPath = serializationBase.extractPath(value.uri);
      if (extractedPath !== null) {
        assert.strictEqual(
          extractedPath[0],
          value.path,
          "Uri path did not parse correctly!"
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
});
