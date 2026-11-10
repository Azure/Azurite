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
import TableBatchUtils from "../../../src/table/batch/TableBatchUtils";
import { EdmDateTime } from "../../../src/table/entity/EdmDateTime";
import { EdmInt64 } from "../../../src/table/entity/EdmInt64";
import { NormalizedEntity } from "../../../src/table/entity/NormalizedEntity";
import { Entity } from "../../../src/table/persistence/ITableMetadataStore";
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

  it("creates a readable batch response body stream", async () => {
    const queryResponseMock =
      SerializationObjectForBatchRequestFactory.GetBatchTableQueryEntitiesWithPartitionAndRowKeyResponseMock();
    assert.ok(
      typeof (queryResponseMock.body as any).pipe === "function",
      "body should be a readable stream"
    );
    const bodyString = await TableBatchUtils.StreamToString(queryResponseMock.body);
    assert.ok(bodyString.includes('"PartitionKey":"part1"'));
  });
});

describe("EdmInt64 serialization", () => {
  it("accepts values within the signed 64-bit integer range", () => {
    const values = [
      "-9223372036854775808",
      "-9007199254740992",
      "0",
      "9007199254740992",
      "9223372036854775807"
    ];

    for (const value of values) {
      assert.strictEqual(EdmInt64.validate(value), value);
    }
  });

  it("rejects values outside the signed 64-bit integer range", () => {
    const values = [
      "-9223372036854775809",
      "9223372036854775808",
      "18446744073709551615"
    ];

    for (const value of values) {
      assert.throws(() => EdmInt64.validate(value), RangeError);
    }
  });

  it("rejects strings that are not decimal integers", () => {
    const values = ["", "1.0", "1e3", "not-an-integer"];

    for (const value of values) {
      assert.throws(() => EdmInt64.validate(value), TypeError);
    }
  });

  it("serializes out-of-range values persisted by older versions", () => {
    const entity: Entity = {
      PartitionKey: "partition",
      RowKey: "row",
      eTag: "etag",
      lastModifiedTime: "2026-09-23T00:00:00.0000000Z",
      properties: {
        Value: "18446744073709551615",
        "Value@odata.type": "Edm.Int64"
      }
    };

    const response = new NormalizedEntity(entity, false).toResponseString(
      "application/json;odata=nometadata",
      {}
    );

    assert.ok(response.includes('"Value":"18446744073709551615"'));
  });
});

describe("EdmDateTime serialization", () => {
  it("accepts values within the supported DateTime range", () => {
    const values = [
      "1601-01-01T00:00:00.0000000Z",
      "1601-01-01T00:00:00Z",
      "1601-01-01T01:00:00+01:00",
      "1600-12-31T23:00:00-01:00",
      "2012-01-02T23:00:00",
      "2012-01-02T23:00Z",
      "2012-01-02",
      "2024-02-29T00:00:00.1Z",
      "9999-12-31T23:59:59.9999999Z",
      "9999-12-31T23:59:59.9999999"
    ];

    for (const value of values) {
      assert.strictEqual(EdmDateTime.validate(value), value);
    }
  });

  it("rejects values outside the supported DateTime range", () => {
    const values = [
      "0001-01-01T00:00:00.0000000Z",
      "1600-12-31T23:59:59.9999999Z",
      "1601-01-01T00:00:00.0000000+00:01",
      "9999-12-31T23:59:59.9999999-00:01"
    ];

    for (const value of values) {
      assert.throws(() => EdmDateTime.validate(value), RangeError);
    }
  });

  it("rejects strings that are not ISO 8601 date-time values", () => {
    const values = [
      "",
      "not-a-date",
      "2012-01-02T23:00:00ZZ",
      "2012-01-02T23:00:00.12345678Z",
      "2012-01-02T23:00:00,1Z",
      "2012-01-02T24:00:00Z",
      "2023-02-29T00:00:00Z",
      "2012-01-02T23:00:00+24:00",
      "Mon, 02 Jan 2012 23:00:00 GMT"
    ];

    for (const value of values) {
      assert.throws(() => EdmDateTime.validate(value), TypeError);
    }
  });

  it("stores values without a time zone suffix as UTC", () => {
    assert.strictEqual(
      new EdmDateTime("2012-01-02T23:00:00").typedValue,
      "2012-01-02T23:00:00Z"
    );
    assert.strictEqual(
      new EdmDateTime("2012-01-02T23:00:00.1234567Z").typedValue,
      "2012-01-02T23:00:00.1234567Z"
    );
    assert.strictEqual(
      new EdmDateTime("2012-01-02").typedValue,
      "2012-01-02T00:00:00Z"
    );
    assert.strictEqual(
      EdmDateTime.validate(new EdmDateTime("2012-01-02").typedValue),
      "2012-01-02T00:00:00Z"
    );
  });

  it("serializes out-of-range values persisted by older versions", () => {
    const entity: Entity = {
      PartitionKey: "partition",
      RowKey: "row",
      eTag: "etag",
      lastModifiedTime: "2026-10-21T00:00:00.0000000Z",
      properties: {
        Value: "0001-01-01T00:00:00.0000000Z",
        "Value@odata.type": "Edm.DateTime"
      }
    };

    assert.throws(() => new NormalizedEntity(entity), RangeError);

    const response = new NormalizedEntity(entity, false).toResponseString(
      "application/json;odata=nometadata",
      {}
    );

    assert.ok(response.includes('"Value":"0001-01-01T00:00:00.0000000Z"'));
  });

  it("serializes malformed values persisted by older versions", () => {
    for (const value of ["not-a-date", "2012-01-02Z", "1600-12-31Z"]) {
      const entity: Entity = {
        PartitionKey: "partition",
        RowKey: "row",
        eTag: "etag",
        lastModifiedTime: "2026-10-21T00:00:00.0000000Z",
        properties: {
          Value: value,
          "Value@odata.type": "Edm.DateTime"
        }
      };

      assert.throws(() => new NormalizedEntity(entity), TypeError);

      const response = new NormalizedEntity(entity, false).toResponseString(
        "application/json;odata=nometadata",
        {}
      );

      assert.ok(response.includes(`"Value":"${value}"`));
    }
  });
});
