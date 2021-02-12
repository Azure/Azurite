// Unit Tests for serialization
import * as assert from "assert";
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

    const request = SerializationObjectForBatchRequestFactory.GetBatchRequestForQueryWithPartitionandRowKeyResponseMock();
    request.ingestOptionalParams(
      new BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams()
    );

    const serializedBatchOperationResponse = await serializer.serializeTableQueryEntityWithPartitionAndRowKeyBatchResponse(
      request,
      SerializationObjectForBatchRequestFactory.GetBatchTableQueryEntitiesWithPartitionAndRowKeyResponseMock()
    );

    assert.equal(
      serializedBatchOperationResponse,
      expectedResponseString,
      "failed to serialize objects to correct serialized string representation"
    );
  });

  it("serializes, mock table batch response to single insert", async () => {
    // use the expected response string to compare the request to
    // ToDo: Do we need partial or full? Currently Using full
    const expectedResponseString =
      SerializationResponseMocks.PartialBatchSingleInsertOrReplaceResponseString;
    const serializer = new TableBatchSerialization();
    // first we need to ingest the serialized request string, which fills some props on the serializer
    serializer.deserializeBatchRequest(
      SerializationRequestMockStrings.BatchSingleInsertOrReplaceRequestString
    );

    const request = SerializationObjectForBatchRequestFactory.GetBatchRequestForSingleInsertResponseMock();
    request.ingestOptionalParams(new BatchTableInsertEntityOptionalParams());

    const serializedBatchOperationResponse = serializer.serializeTableInsertEntityBatchResponse(
      request,
      SerializationObjectForBatchRequestFactory.GetBatchOperationMockForSingleInsert()
    );

    assert.equal(
      serializedBatchOperationResponse,
      expectedResponseString,
      "failed to serialize objects to correct serialized string representation"
    );
  });
});
