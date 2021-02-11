// Unit Tests for serialization
import * as assert from "assert";
import BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams from "../../../src/table/batch/BatchTableQueryEntitiesWithPartitionAndRowKeyOptionalParams";
import { TableBatchSerialization } from "../../../src/table/batch/TableBatchSerialization";
import SerializationRequestMockStrings from "./mock.request.serialization.strings";
import SerializationResponseMocks from "./mock.response.serialization.strings";
import SerializationObjectForBatchRequestFactory from "./mock.serialization.batchrequest.factory";

describe("batch serialization unit tests, these are not the API integration tests:", () => {
  it("serializes, mock table batch response to query with partition key and row key operation correctly", async () => {
    // use the expected response string to compare the
    const expectedResponseString =
      SerializationResponseMocks.BatchQueryWithPartitionKeyAndRowKeyResponse;
    const serializer = new TableBatchSerialization();
    // first we need to ingest the serialized request string, which fills some props on the serializer
    serializer.deserializeBatchRequest(
      SerializationRequestMockStrings.BatchQueryWithPartitionKeyAndRowKeyRequest
    );

    const request = SerializationObjectForBatchRequestFactory.GetBatchRequestForResponseMock();
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
});
