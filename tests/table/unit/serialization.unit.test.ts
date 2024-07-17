// Unit Tests for serialization
// ToDo: I know these are not all strictly Unit tests
// while we finalize the reverse engineering of the table API,
// there is a lot of refactoring.
// meaning that we are not 100% sure of the correct object schemas.
// once this is all complete, we can further refactor and clean up
// objects and tests.
import * as assert from "assert";
import BatchTableDeleteEntityOptionalParams from "../../../src/table/batch/BatchTableDeleteEntityOptionalParams";
import BatchTableInsertEntityOptionalParams from "../../../src/table/batch/BatchTableInsertEntityOptionalParams";
import BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams from "../../../src/table/batch/BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams";
import { TableBatchSerialization } from "../../../src/table/batch/TableBatchSerialization";
import SerializationRequestMockStrings from "./mock.request.serialization.strings";
import SerializationResponseMocks from "./mock.response.serialization.strings";
import SerializationObjectForBatchRequestFactory from "./mock.serialization.batchrequest.factory";

describe("batch serialization unit tests, these are not the API integration tests:", () => {
  it("serializes, mock table batch response to query with partition key and row key operation correctly", async () => {
    // use the expected response string to compare the
    const expectedResponseString =
      SerializationResponseMocks.PartialBatchQueryWithPartitionKeyAndRowKeyResponse;
    const serializer = new TableBatchSerialization();
    // first we need to ingest the serialized request string, which fills some props on the serializer
    serializer.deserializeBatchRequest(
      SerializationRequestMockStrings.BatchQueryWithPartitionKeyAndRowKeyRequest
    );

    const request =
      SerializationObjectForBatchRequestFactory.GetBatchRequestForQueryWithPartitionandRowKeyResponseMock();
    request.ingestOptionalParams(
      new BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams()
    );

    const serializedBatchOperationResponse =
      await serializer.serializeTableQueryEntityWithPartitionAndRowKeyBatchResponse(
        request,
        SerializationObjectForBatchRequestFactory.GetBatchTableQueryEntitiesWithPartitionAndRowKeyResponseMock()
      );

    const splitResponse = serializedBatchOperationResponse.split("\r\n");
    const splitExpected = expectedResponseString.split("\r\n");
    splitResponse.forEach((value) => {
      if (value.length > 2) {
        assert.notEqual(
          splitExpected.indexOf(value),
          -1,
          "Could not find " + value
        );
      }
    });

    // no closing "done()" callback in async test
  });

  it("serializes, mock table batch response to single insert", (done) => {
    // use the expected response string to compare the request to
    const expectedResponseString =
      SerializationResponseMocks.PartialBatchSingleInsertOrReplaceResponseString;
    const serializer = new TableBatchSerialization();
    // first we need to ingest the serialized request string, which fills some props on the serializer
    serializer.deserializeBatchRequest(
      SerializationRequestMockStrings.BatchSingleInsertOrReplaceRequestString
    );

    const request =
      SerializationObjectForBatchRequestFactory.GetBatchRequestForSingleInsertResponseMock();
    request.ingestOptionalParams(new BatchTableInsertEntityOptionalParams());

    const serializedBatchOperationResponse =
      serializer.serializeTableInsertEntityBatchResponse(
        request,
        SerializationObjectForBatchRequestFactory.GetBatchOperationMockForSingleInsert()
      );

    const splitResponse = serializedBatchOperationResponse.split("\r\n");
    const splitExpected = expectedResponseString.split("\r\n");
    splitExpected.forEach((value) => {
      if (value.length > 2) {
        assert.notEqual(
          splitResponse.indexOf(value),
          -1,
          "Could not find " + value + " in serialized response."
        );
      }
    });
    done();
  });

  it("serializes, mock table batch response to single delete", async () => {
    // use the expected response string to compare the request to
    // ToDo: Do we need partial or full? Currently Using full
    const expectedResponseString =
      SerializationResponseMocks.PartialBatchSingleDeleteResponseString;
    const serializer = new TableBatchSerialization();
    // first we need to ingest the serialized request string, which fills some props on the serializer
    serializer.deserializeBatchRequest(
      SerializationRequestMockStrings.BatchSingleDeleteRequestString
    );

    const request =
      SerializationObjectForBatchRequestFactory.GetBatchRequestForSingleDeleteResponseMock();
    request.ingestOptionalParams(new BatchTableDeleteEntityOptionalParams());

    const serializedBatchOperationResponse =
      serializer.serializeTableDeleteEntityBatchResponse(
        request,
        SerializationObjectForBatchRequestFactory.GetBatchOperationMockForSingleDelete()
      );

    const splitResponse = serializedBatchOperationResponse.split("\r\n");
    const splitExpected = expectedResponseString.split("\r\n");
    splitExpected.forEach((value) => {
      if (value === "DataServiceVersion: 3.0;") {
        assert.notStrictEqual(
          // Azure Table Storage responds with a data service version header of 1.0
          // on batch delete
          splitResponse.indexOf("DataServiceVersion: 1.0;"),
          -1,
          "Could not find DataServiceVersion: 1.0; in serialized response."
        );
      } else if (value.length > 2) {
        assert.notStrictEqual(
          splitResponse.indexOf(value),
          -1,
          "Could not find " + value + " in serialized response."
        );
      }
    });
  });
});
