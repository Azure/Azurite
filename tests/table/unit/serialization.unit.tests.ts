// Unit Tests for serialization
import * as assert from "assert";
import { BatchType } from "../../../src/common/batch/BatchOperation";
import { TableBatchSerialization } from "../../../src/table/batch/TableBatchSerialization";
import SerializationMocks from "./mock.serialization";

describe("batch serialization and deserialization unit tests, these are not the API integration tests:", () => {
  it("deserializes, mock table batch request containing 3 requests correctly", (done) => {
    const requestString = SerializationMocks.Sample3InsertsUsingSDK;
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
    const requestString = SerializationMocks.Sample1QueryUsingSDK;
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
    const requestString = SerializationMocks.SampleInsertThenMergeUsingSDK;
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

  // ToDo: we need to test the serialization and function of
  // the BatchRequest type as well
});
