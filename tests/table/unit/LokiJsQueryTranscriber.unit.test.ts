import * as assert from "assert";
import LokiJsQueryTranscriberFactory from "../../../src/table/persistence/QueryTranscriber/LokiJsQueryTranscriberFactory";

describe("LokiJs Query Transcribing unit tests, also ensures backward compatability with earlier schemas:", () => {
  it("correctly transcribes a simple query with irregular whitespace", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "( )",
        expectedQuery: "return ( ( ) )"
      },
      {
        originalQuery: "(partitionKey eq 'test')",
        expectedQuery: "return ( ( item.properties.partitionKey === 'test' ) )"
      },
      {
        originalQuery: "( partitionKey eq 'test' )",
        expectedQuery: "return ( ( item.properties.partitionKey === 'test' ) )"
      },
      {
        originalQuery: "('test' eq partitionKey)",
        expectedQuery: "return ( ( 'test' === item.properties.partitionKey ) )"
      },
      {
        originalQuery: "( 'test' eq partitionKey )",
        expectedQuery: "return ( ( 'test' === item.properties.partitionKey ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.start();
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

  it("correctly transcribes a query for a value of type boolean", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myBoolean eq false )",
        expectedQuery: "return ( ( item.properties.myBoolean === false ) )"
      },
      {
        originalQuery: "( true eq myBoolean )",
        expectedQuery: "return ( ( true === item.properties.myBoolean ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.start();
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

  it("correctly transcribes a query for a value of type double", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myDouble lt 123.01 )",
        expectedQuery: "return ( ( item.properties.myDouble < 123.01 ) )"
      },
      {
        originalQuery: "( 123.01 gt myDouble )",
        expectedQuery: "return ( ( 123.01 > item.properties.myDouble ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.start();
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

  it("correctly transcribes a query for a value of type Guid", async () => {
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

      queryTranscriber.start();
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

  it("correctly transcribes a query for a value of type string", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myString eq '123.01' )",
        expectedQuery: "return ( ( item.properties.myString === '123.01' ) )"
      },
      {
        originalQuery: "( '123.01L' eq myString )",
        expectedQuery: "return ( ( '123.01L' === item.properties.myString ) )"
      },
      {
        originalQuery: "( 'I am a string' eq myString )",
        expectedQuery:
          "return ( ( 'I am a string' === item.properties.myString ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.start();
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

  it("correctly transcribes a query for a value of type integer", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myInt eq 123 )",
        expectedQuery: "return ( ( item.properties.myInt === 123 ) )"
      },
      {
        originalQuery: "( -123 lt myInt )",
        expectedQuery: "return ( ( -123 < item.properties.myInt ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.start();
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

  it("correctly transcribes a query for a value of type long", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myLong eq 123.01L )",
        expectedQuery: "return ( ( item.properties.myLong === '123.01' ) )"
      },
      {
        originalQuery: "( 123.01L eq myLong )",
        expectedQuery: "return ( ( '123.01' === item.properties.myLong ) )"
      },
      {
        originalQuery: "PartitionKey eq 'partition1' and int64Field eq 12345L",
        expectedQuery:
          "return ( item.properties.PartitionKey === 'partition1' && item.properties.int64Field === '12345' )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.start();
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

  it("correctly transcribes a query for a value of type date", async () => {
    // use the expected response string to compare the reult to.
    const timestamp = new Date();
    timestamp.setDate(timestamp.getDate() + 1);
    const newTimeStamp = timestamp.toISOString();
    const testArray = [
      {
        originalQuery: `(myDate eq datetime'${newTimeStamp}'  )`,
        expectedQuery: `return ( ( new Date(item.properties.myDate).getTime() === new Date('${newTimeStamp}').getTime() ) )`
      },
      {
        originalQuery: `( datetime'${newTimeStamp}' eq myDate )`,
        expectedQuery: `return ( ( new Date('${newTimeStamp}').getTime() === new Date(item.properties.myDate).getTime() ) )`
      },
      {
        originalQuery: `PartitionKey eq 'partition1' and number gt 11 and Timestamp lt datetime'${newTimeStamp}'`,
        expectedQuery: `return ( item.properties.PartitionKey === 'partition1' && item.properties.number > 11 && new Date(item.properties.Timestamp).getTime() < new Date('${newTimeStamp}').getTime() )`
      },
      {
        originalQuery: `PartitionKey eq 'partition1' and number lt 11 and Timestamp lt datetime'${newTimeStamp}'`,
        expectedQuery: `return ( item.properties.PartitionKey === 'partition1' && item.properties.number < 11 && new Date(item.properties.Timestamp).getTime() < new Date('${newTimeStamp}').getTime() )`
      },
      {
        originalQuery: `(PartitionKey eq 'partition1') and (number lt 12) and (Timestamp lt datetime'${newTimeStamp}')`,
        expectedQuery: `return ( ( item.properties.PartitionKey === 'partition1' ) && ( item.properties.number < 12 ) && ( new Date(item.properties.Timestamp).getTime() < new Date('${newTimeStamp}').getTime() ) )`
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.start();
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

  it("correctly transcribes a query with multiple predicates", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "(myInt eq 123 ) and (myString eq 'hello')",
        expectedQuery:
          "return ( ( item.properties.myInt === 123 ) && ( item.properties.myString === 'hello' ) )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.start();
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

  it("correctly transcribes a query with multiple predicates and no brackets", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: "PartitionKey eq 'partitionKey' and int32Field eq 54321",
        expectedQuery:
          "return ( item.properties.PartitionKey === 'partitionKey' && item.properties.int32Field === 54321 )"
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.start();
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

  // binary query - not yet supported
  it("correctly transcribes a query for a value of type binary", async () => {
    // use the expected response string to compare the reult to.
    const testArray = [
      {
        originalQuery: `(PartitionKey eq 'part1') and (binaryField eq binary'62696e61727944617461')`,
        expectedQuery: `return ( ( item.properties.PartitionKey === 'part1' ) && ( item.properties.binaryField === 'YmluYXJ5RGF0YQ==' ) )`
      },
      {
        originalQuery: `(PartitionKey eq 'part1') and (binaryField eq X'62696e61727944617461')`,
        expectedQuery: `return ( ( item.properties.PartitionKey === 'part1' ) && ( item.properties.binaryField === 'YmluYXJ5RGF0YQ==' ) )`
      }
    ];

    for (const test of testArray) {
      const queryTranscriber =
        LokiJsQueryTranscriberFactory.createQueryTranscriber(
          test.originalQuery,
          "stateMachineTest"
        );

      queryTranscriber.start();
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

  // table tablename query - ToDo!
});
