// Unit Tests for serialization
import * as assert from "assert";
import { BatchType } from "../../../src/common/batch/BatchOperation";
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

  // Partition Key Extraction
  /*
  {
  batchOperation: {
    batchType: "table",
    rawHeaders: [
      "HTTP/1.1\r",
      "Accept: application/json;odata=minimalmetadata\r",
      "Content-Type: application/json\r",
      "DataServiceVersion: 3.0;\r",
      "\r",
      "",
    ],
    httpMethod: "PUT",
    path: "SampleHubVSHistory",
    uri: "http://127.0.0.1:10002/devstoreaccount1/SampleHubVSHistory(PartitionKey='1c3a11bb972c429fbf1b62d71d188003',RowKey='0000000000000000')",
    jsonRequestBody: "{\"EventId\":-1,\"IsPlayed\":false,\"_Timestamp\":\"2021-02-26T08:49:07.6232844Z\",\"_Timestamp@odata.type\":\"Edm.DateTime\",\"EventType\":\"OrchestratorStarted\",\"ExecutionId\":\"09a10e2fff2947fd9c4db05a8660e355\"}",
  },
  headers: {
    headerItems: {
      "HTTP/1.1\r": "",
      Accept: "",
      "Content-Type": "",
      DataServiceVersion: "",
    },
    headerCount: 4,
    rawHeaders: [
      "HTTP/1.1\r",
      "Accept: application/json;odata=minimalmetadata\r",
      "Content-Type: application/json\r",
      "DataServiceVersion: 3.0;\r",
      "\r",
      "",
    ],
  },
  params: {
    tableEntityProperties: {
      EventId: -1,
      IsPlayed: false,
      _Timestamp: "2021-02-26T08:49:07.6232844Z",
      "_Timestamp@odata.type": "Edm.DateTime",
      EventType: "OrchestratorStarted",
      ExecutionId: "09a10e2fff2947fd9c4db05a8660e355",
    },
    queryOptions: {
      format: "application/json;odata=nometadata",
    },
  },
}
  */
});
