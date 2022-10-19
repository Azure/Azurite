import * as assert from "assert";
import LokiJsQueryTranscriberFactory from "../../../src/table/persistence/QueryTranscriber/LokiJsQueryTranscriberFactory";
import { QueryStateName } from "../../../src/table/persistence/QueryTranscriber/QueryStateName";

describe("LokiJs Query Transcribing unit tests, to ensure backward compatability with earlier schemas:", () => {
  it("correctly transcribes a simple query", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "( )",
        expectedQuery: "return ( ( ) )"
      },
      {
        originalQuery: "(partitionKey eq 'test')",
        expectedQuery: "return ( ( partitionKey === 'test' ) )"
      },
      {
        originalQuery: "( partitionKey eq 'test' )",
        expectedQuery: "return ( ( partitionKey === 'test' ) )"
      },
      {
        originalQuery: "('test' eq partitionKey)",
        expectedQuery: "return ( ( 'test' === partitionKey ) )"
      },
      {
        originalQuery: "( 'test' eq partitionKey )",
        expectedQuery: "return ( ( 'test' === partitionKey ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.setState(QueryStateName.QueryStarted);
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }

    // no closing "done()" callback in async test
  });

  it("correctly transcribes a boolean query", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myBoolean eq false )",
        expectedQuery: "return ( ( myBoolean === false ) )"
      },
      {
        originalQuery: "( true eq myBoolean )",
        expectedQuery: "return ( ( true === myBoolean ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.setState(QueryStateName.QueryStarted);
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }

    // no closing "done()" callback in async test
  });

  it("correctly transcribes a double query", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myDouble lt 123.01 )",
        expectedQuery: "return ( ( myDouble < 123.01 ) )"
      },
      {
        originalQuery: "( 123.01 gt myDouble )",
        expectedQuery: "return ( ( 123.01 > myDouble ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.setState(QueryStateName.QueryStarted);
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }

    // no closing "done()" callback in async test
  });

  it("correctly transcribes a Guid query", async () => {
    // use the expected response string to compare the reult to.
    // guid should have both simple string rep and base64 encoded
    // version for legacy schema compatibility
    const testArray = [
      {
        originalQuery:
          "(myGuid eq guid'12345678-1234-1234-1234-1234567890ab' )",
        expectedQuery:
          "return ( ( ( item.properties.myGuid === '12345678-1234-1234-1234-1234567890ab' ) || ( item.properties.myGuid === 'MTIzNDU2NzgtMTIzNC0xMjM0LTEyMzQtMTIzNDU2Nzg5MGFi' ) ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.setState(QueryStateName.QueryStarted);
      assert.strictEqual(
        queryTranscriber.getTranscribedQuery(),
        test.expectedQuery,
        `Transcribed query "${queryTranscriber.getTranscribedQuery()}" did not match expected ${
          test.expectedQuery
        }`
      );
    }

    // no closing "done()" callback in async test
  });
});
