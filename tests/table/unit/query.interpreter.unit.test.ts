import * as assert from "assert";
import parseQuery from "../../../src/table/persistence/QueryInterpreter/QueryParser";
import { IQueryContext } from "../../../src/table/persistence/QueryInterpreter/IQueryContext";
import executeQuery from "../../../src/table/persistence/QueryInterpreter/QueryInterpreter";
import {
  Entity,
  Table
} from "../../../src/table/persistence/ITableMetadataStore";

describe("Query Interpreter", () => {
  function runTestCases(
    name: string,
    context: IQueryContext,
    testCases: {
      name: string;
      originalQuery: string;
      expectedResult: any;
    }[]
  ) {
    describe(name, () => {
      for (const test of testCases) {
        it(test.name, () => {
          const queryTree = parseQuery(test.originalQuery);
          assert.strictEqual(
            executeQuery(context, queryTree),
            test.expectedResult,
            "it should execute the query tree correctly"
          );
        });
      }
    });
  }

  const referenceEntity: Entity = {
    PartitionKey: "testPartition",
    RowKey: "testRow",
    eTag: "testETag",
    lastModifiedTime: "2023-05-29T15:30:00Z",
    properties: {
      test: "test",
      int32: 123,
      int64: "123.01",
      double: -123.01,
      bool: true,
      date: "2020-01-01T00:00:00.000Z",
      microsecondDate: "2023-01-01T00:00:00.000000Z",
      guid: Buffer.from("00000000-0000-0000-0000-000000000000").toString("base64"),
      guidLegacy: "00000000-0000-0000-0000-000000000000",
      binary: Buffer.from("binaryData").toString("base64"),
      emptyString: "",
      nullValue: null
    }
  };

  const referenceTable: Table = {
    table: "testTable",
    account: "testAccount"
  };

  describe("Built-in Identifiers", () => {
    runTestCases("PartitionKey", referenceEntity, [
      {
        name: "PartitionKey equality",
        originalQuery: "PartitionKey eq 'testPartition'",
        expectedResult: true
      },
      {
        name: "PartitionKey equality reversed order",
        originalQuery: "'testPartition' eq PartitionKey",
        expectedResult: true
      },
      {
        name: "PartitionKey equality (doesn't match)",
        originalQuery: "PartitionKey eq 'testPartition2'",
        expectedResult: false
      }
    ]);

    runTestCases("RowKey", referenceEntity, [
      {
        name: "RowKey equality",
        originalQuery: "RowKey eq 'testRow'",
        expectedResult: true
      },
      {
        name: "RowKey equality (doesn't match)",
        originalQuery: "RowKey eq 'testRow2'",
        expectedResult: false
      },
      {
        name: "PartitionKey equality and RowKey range",
        originalQuery:
          "PartitionKey eq 'testPartition' and RowKey gt 'testRoom' and RowKey lt 'testRoxy'",
        expectedResult: true
      },
      {
        name: "PartitionKey equality and RowKey range (doesn't match)",
        originalQuery:
          "PartitionKey eq 'testPartition' and RowKey gt 'testAnt' and RowKey lt 'testMoose'",
        expectedResult: false
      }
    ]);

    runTestCases("TableName", referenceTable, [
      {
        name: "TableName equality",
        originalQuery: "TableName eq 'testTable'",
        expectedResult: true
      },
      {
        name: "TableName equality (doesn't match)",
        originalQuery: "TableName eq 'testTable2'",
        expectedResult: false
      }
    ]);
  });

  describe("Logical Operators", () => {
    runTestCases("and", referenceEntity, [
      {
        name: "PartitionKey equality and RowKey range",
        originalQuery:
          "PartitionKey eq 'testPartition' and RowKey gt 'testRoom' and RowKey lt 'testRoxy'",
        expectedResult: true
      },
      {
        name: "PartitionKey equality and RowKey range (doesn't match)",
        originalQuery:
          "PartitionKey eq 'testPartition' and RowKey gt 'testAnt' and RowKey lt 'testMoose'",
        expectedResult: false
      }
    ]);

    runTestCases("or", referenceEntity, [
      {
        name: "PartitionKey set",
        originalQuery:
          "PartitionKey eq 'testPartition' or PartitionKey eq 'testPartition2'",
        expectedResult: true
      },
      {
        name: "PartitionKey set (doesn't match)",
        originalQuery:
          "PartitionKey eq 'testPartition2' or PartitionKey eq 'testPartition3'",
        expectedResult: false
      }
    ]);

    runTestCases("not", referenceEntity, [
      {
        name: "PartitionKey not equal",
        originalQuery: "not PartitionKey eq 'testPartition'",
        expectedResult: false
      },
      {
        name: "PartitionKey not equal (matches)",
        originalQuery: "not PartitionKey eq 'testPartition2'",
        expectedResult: true
      }
    ]);
  });

  describe("Comparison Operators", () => {
    runTestCases("eq", referenceEntity, [
      {
        name: "PartitionKey equality",
        originalQuery: "PartitionKey eq 'testPartition'",
        expectedResult: true
      },
      {
        name: "PartitionKey equality (doesn't match)",
        originalQuery: "PartitionKey eq 'testPartition2'",
        expectedResult: false
      },
      {
        name: "Property equality",
        originalQuery: "test eq 'test'",
        expectedResult: true
      },
      {
        name: "Property equality (doesn't match)",
        originalQuery: "test eq 'test2'",
        expectedResult: false
      },
      {
        name: "GUID equality (modern)",
        originalQuery: "guid eq guid'00000000-0000-0000-0000-000000000000'",
        expectedResult: true
      },
      {
        name: "GUID equality (modern) (doesn't match)",
        originalQuery: "guid eq guid'00000000-0000-0000-0000-000000000001'",
        expectedResult: false
      },
      {
        name: "GUID equality (legacy)",
        originalQuery:
          "guidLegacy eq guid'00000000-0000-0000-0000-000000000000'",
        expectedResult: true
      },
      {
        name: "GUID equality (legacy) (doesn't match)",
        originalQuery:
          "guidLegacy eq guid'00000000-0000-0000-0000-000000000001'",
        expectedResult: false
      },
      {
        name: "Binary equality",
        originalQuery: "binary eq binary'62696e61727944617461'",
        expectedResult: true
      },
      {
        name: "Binary equality (doesn't match)",
        originalQuery: "binary eq binary'000000000000'",
        expectedResult: false
      }
    ]);
  });

  describe("Values", () => {
    runTestCases("Booleans", referenceEntity, [
      {
        name: "true",
        originalQuery: "bool eq true",
        expectedResult: true
      },
      {
        name: "false",
        originalQuery: "bool eq false",
        expectedResult: false
      },
      {
        name: "Compound queries using booleans",
        originalQuery:
          "(true and RowKey eq 'testRow') and (false or PartitionKey eq 'testPartition')",
        expectedResult: true
      }
    ]);

    runTestCases("GUIDs", referenceEntity, [
      {
        name: "GUID equality (modern)",
        originalQuery: "guid eq guid'00000000-0000-0000-0000-000000000000'",
        expectedResult: true
      },
      {
        name: "GUID equality (modern) (doesn't match)",
        originalQuery: "guid eq guid'00000000-0000-0000-0000-000000000001'",
        expectedResult: false
      },
      {
        name: "GUID equality (legacy)",
        originalQuery:
          "guidLegacy eq guid'00000000-0000-0000-0000-000000000000'",
        expectedResult: true
      },
      {
        name: "GUID equality (legacy) (doesn't match)",
        originalQuery:
          "guidLegacy eq guid'00000000-0000-0000-0000-000000000001'",
        expectedResult: false
      },
      {
        name: "GUID inequality (modern)",
        originalQuery: "guid ne guid'22222222-2222-2222-2222-222222222222'",
        expectedResult: true
      },
      {
        name: "GUID inequality (legacy)",
        originalQuery:
          "guidLegacy ne guid'22222222-2222-2222-2222-222222222222'",
        expectedResult: true
      },
      {
        name: "GUID compare against missing property",
        originalQuery: "missingProperty eq guid'00000000-0000-0000-0000-000000000000'",
        expectedResult: false
      },
      {
        name: " GUID compare against null property",
        originalQuery: "nullValue eq guid'00000000-0000-0000-0000-000000000000'",
        expectedResult: false
      },
      {
        name: "GUID compare against empty string",
        originalQuery: "emptyString eq guid'00000000-0000-0000-0000-000000000000'",
        expectedResult: false
      }
    ])

    runTestCases("DateTimes", referenceEntity, [
      {
        name: "DateTime equality",
        originalQuery: "date eq datetime'2020-01-01T00:00:00.000Z'",
        expectedResult: true
      },
      {
        name: "DateTime equality (doesn't match)",
        originalQuery: "date eq datetime'2020-01-01T00:00:01.000Z'",
        expectedResult: false
      },
      {
        name: "DateTime equality (microseconds)",
        originalQuery: "microsecondDate eq datetime'2023-01-01T00:00:00.000000Z'",
        expectedResult: true
      },
      {
        name: "DateTime equality (microseconds) (doesn't match)",
        originalQuery: "microsecondDate eq datetime'2023-01-01T00:00:00.001000Z'",
        expectedResult: false
      },
      {
        name: "DateTime inequality",
        originalQuery: "date ne datetime'2020-01-01T00:00:01.000000Z'",
        expectedResult: true
      },
      {
        name: "DateTime inequality (doesn't match)",
        originalQuery: "date ne datetime'2020-01-01T00:00:00.000000Z'",
        expectedResult: false
      },
      {
        name: "DateTime inequality (microseconds)",
        originalQuery: "microsecondDate ne datetime'2023-01-01T00:00:01.000000Z'",
        expectedResult: true
      },
      {
        name: "DateTime inequality (microseconds) (doesn't match)",
        originalQuery: "microsecondDate ne datetime'2023-01-01T00:00:00.000000Z'",
        expectedResult: false
      },
      {
        name: "DateTime greater than",
        originalQuery: "date gt datetime'2019-12-31T23:59:59.999999Z'",
        expectedResult: true
      },
      {
        name: "DateTime greater than (doesn't match)",
        originalQuery: "date gt datetime'2020-01-01T00:00:00.000000Z'",
        expectedResult: false
      },
      {
        name: "DateTime greater than (microseconds)",
        originalQuery: "microsecondDate gt datetime'2022-12-31T23:59:59.999999Z'",
        expectedResult: true
      },
      {
        name: "DateTime greater than (microseconds) (doesn't match)",
        originalQuery: "microsecondDate gt datetime'2023-01-01T00:00:00.000000Z'",
        expectedResult: false
      },
      {
        name: "DateTime greater than or equal",
        originalQuery: "date ge datetime'2020-01-01T00:00:00.000000Z'",
        expectedResult: true
      },
      {
        name: "DateTime greater than or equal (doesn't match)",
        originalQuery: "date ge datetime'2020-01-01T00:00:00.001000Z'",
        expectedResult: false
      },
      {
        name: "DateTime greater than or equal (microseconds)",
        originalQuery: "microsecondDate ge datetime'2023-01-01T00:00:00.000000Z'",
        expectedResult: true
      },
      {
        name: "DateTime greater than or equal (microseconds) (doesn't match)",
        originalQuery: "microsecondDate ge datetime'2023-01-01T00:00:00.001000Z'",
        expectedResult: false
      },
      {
        name: "DateTime less than",
        originalQuery: "date lt datetime'2020-01-01T00:00:00.001Z'",
        expectedResult: true
      },
      {
        name: "DateTime less than (doesn't match)",
        originalQuery: "date lt datetime'2020-01-01T00:00:00.000Z'",
        expectedResult: false
      },
      {
        name: "DateTime less than (microseconds)",
        originalQuery: "microsecondDate lt datetime'2023-01-01T00:00:00.001000Z'",
        expectedResult: true
      },
      {
        name: "DateTime less than (microseconds) (doesn't match)",
        originalQuery: "microsecondDate lt datetime'2023-01-01T00:00:00.000000Z'",
        expectedResult: false
      },
      {
        name: "DateTime less than or equal",
        originalQuery: "date le datetime'2020-01-01T00:00:00.000000Z'",
        expectedResult: true
      },
      {
        name: "DateTime less than or equal (doesn't match)",
        originalQuery: "date le datetime'2019-12-31T23:59:59.999999Z'",
        expectedResult: false
      },
      {
        name: "DateTime less than or equal (microseconds)",
        originalQuery: "microsecondDate le datetime'2023-01-01T00:00:00.000000Z'",
        expectedResult: true
      },
      {
        name: "DateTime less than or equal (microseconds) (doesn't match)",
        originalQuery: "microsecondDate le datetime'2022-12-31T23:59:59.999999Z'",
        expectedResult: false
      },
      {
        name: "DateTime compare against null value",
        originalQuery: "nullValue eq datetime'2020-01-01T00:00:00.000000Z'",
        expectedResult: false
      },
      {
        name: "DateTime compare against empty string",
        originalQuery: "emptyString eq datetime'2020-01-01T00:00:00.000000Z'",
        expectedResult: false
      },
      {
        name: "DateTime compare against missing property",
        originalQuery: "missingProperty eq datetime'2020-01-01T00:00:00.000000Z'",
        expectedResult: false
      }
    ])
  })

  describe("Regression Tests", () => {
    runTestCases("Issue #1929: Querying nonexistent fields", referenceEntity, [
      {
        name: "Empty string fields should be queryable",
        originalQuery: "emptyString eq ''",
        expectedResult: true
      },
      {
        name: "Empty string fields should be queryable (doesn't match)",
        originalQuery: "emptyString ne ''",
        expectedResult: false
      },
      {
        name: "Empty string queries using ne should not match fields with a value",
        originalQuery: "test ne ''",
        expectedResult: true
      },
      {
        name: "Nonexistent fields should not be queryable",
        originalQuery: "nonExistent ne ''",
        expectedResult: false
      }
    ]);

    describe("Issue #2169: Querying null/missing properties with type annotations", () => {
      // NOTE(notheotherben): This generates a dynamic set of test to validate that all of our query operators return `false` for
      //                      comparisons between values of the given type and the list of appropriate properties (null/missing/empty values).
      const testCases: { [key: string]: string[] } = {
        "datetime'2023-01-01T00:00:00.000000Z'": ["nullValue", "missingProperty", "emptyString"],
        "binary'000000000000'": ["nullValue", "missingProperty"],
        "guid'00000000-0000-0000-0000-000000000000'": ["nullValue", "missingProperty", "emptyString"],
      };

      for (const referenceValue of Object.keys(testCases)) {
        runTestCases(referenceValue, referenceEntity, Array.prototype.concat.apply([], ["eq", "ne", "lt", "le", "gt", "ge"].map((operator) => testCases[referenceValue].map(property => ({
          name: `Should not match ${property} with ${operator}`,
          originalQuery: `${property} ${operator} ${referenceValue}`,
          expectedResult: false
        })))));
      }
    });
  });
});
