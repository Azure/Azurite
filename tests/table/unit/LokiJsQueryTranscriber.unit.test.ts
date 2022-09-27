import * as assert from "assert";
import LokiJsQueryTranscriberFactory from "../../../src/table/persistence/QueryTranscriber/LokiJsQueryTranscriberFactory";
import { QueryStateName } from "../../../src/table/persistence/QueryTranscriber/QueryStateName";

describe("LokiJs Query Transcribing unit tests, to ensure backward compatability with earlier schemas:", () => {
  it("correctly transcribes a simple query", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "( )",
        expectedQuery: "return ( )"
      },
      {
        originalQuery: "(partitionKey eq 'test')",
        expectedQuery: "return (partitionKey eq 'test')"
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
