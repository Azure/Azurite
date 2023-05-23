import * as assert from "assert";
import parseQuery from "../../../src/table/persistence/QueryInterpreter/QueryParser";

describe("Query Parser", () => {
  function runTestCases(name: string, testCases: {
    name: string
    originalQuery: string
    expectedQuery: string
  }[]) {
    describe(name, () => {
      for (const test of testCases) {
        it(test.name, () => {
          const queryTree = parseQuery(test.originalQuery)
          assert.strictEqual(queryTree.toString(), test.expectedQuery, "it should parse the query tree correctly")
        })
      }
    })
  }

  runTestCases("Whitespace Handling", [
    {
      name: "Normalizes irregular whitespace",
      originalQuery: "  PartitionKey   eq    'test1'  ",
      expectedQuery: '(eq PartitionKey "test1")'
    }
  ])

  describe("Unary Operators", () => {
    runTestCases("Groups", [
      {
        name: "Parses basic expression groups",
        originalQuery: "(PartitionKey eq 'test')",
        expectedQuery: '((eq PartitionKey "test"))'
      }
    ])

    runTestCases("not", [
      {
        name: "Parses NOT expressions",
        originalQuery: "not PartitionKey eq 'test'",
        expectedQuery: '(not (eq PartitionKey "test"))'
      },
      {
        name: "NOT takes precedence over EQ",
        originalQuery: "not PartitionKey eq 'test'",
        expectedQuery: "(not (eq PartitionKey \"test\"))"
      },
      {
        name: "Wrapping another condition",
        originalQuery: "not (PartitionKey eq 'test')",
        expectedQuery: "(not ((eq PartitionKey \"test\")))"
      }
    ])
  })

  describe("Binary Operators", () => {
    runTestCases("and", [
      // Operator Precedence: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-odata/f3380585-3f87-41d9-a2dc-ff46cc38e7a6
      {
        name: "AND takes precedence over NOT",
        originalQuery: "not PartitionKey eq 'test' and PartitionKey eq 'test2'",
        expectedQuery: "(and (not (eq PartitionKey \"test\")) (eq PartitionKey \"test2\"))"
      },
      {
        name: "Precedence works with complex queries",
        originalQuery: "(true and RowKey eq '1') and ((false or PartitionKey eq 'partition1') or PartitionKey eq 'partition2') or PartitionKey eq 'partition3'",
        expectedQuery: '(or (and ((and true (eq RowKey "1"))) ((or ((or false (eq PartitionKey "partition1"))) (eq PartitionKey "partition2")))) (eq PartitionKey "partition3"))'
      }
    ])

    runTestCases("or", [
      // Operator Precedence: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-odata/f3380585-3f87-41d9-a2dc-ff46cc38e7a6
      {
        name: "OR takes precedence over AND",
        originalQuery: "PartitionKey eq 'test' or PartitionKey eq 'test2' and RowKey eq 'test3'",
        expectedQuery: "(or (eq PartitionKey \"test\") (and (eq PartitionKey \"test2\") (eq RowKey \"test3\")))"
      },
    ])

    runTestCases("comparisons", [
      {
        name: "Are order invariant for constants and fields",
        originalQuery: "'test' eq PartitionKey",
        expectedQuery: '(eq "test" PartitionKey)'
      },
      {
        name: "Supports equals",
        originalQuery: "PartitionKey eq 'test'",
        expectedQuery: '(eq PartitionKey "test")'
      },
      {
        name: "Supports not equals",
        originalQuery: "PartitionKey ne 'test'",
        expectedQuery: '(ne PartitionKey "test")'
      },
      {
        name: "Supports greater than",
        originalQuery: "PartitionKey gt 'test'",
        expectedQuery: '(gt PartitionKey "test")'
      },
      {
        name: "Supports greater than or equal to",
        originalQuery: "PartitionKey ge 'test'",
        expectedQuery: '(gte PartitionKey "test")'
      },
      {
        name: "Supports less than",
        originalQuery: "PartitionKey lt 'test'",
        expectedQuery: '(lt PartitionKey "test")'
      },
      {
        name: "Supports less than or equal to",
        originalQuery: "PartitionKey le 'test'",
        expectedQuery: '(lte PartitionKey "test")'
      }
    ])
  })

  describe("Identifiers", () => {
    runTestCases("Built-in Identifiers", [
      {
        name: "Normalizes TableName field",
        originalQuery: "'test' eq tablename",
        expectedQuery: '(eq "test" TableName)'
      },
      {
        name: "Normalizes PartitionKey field",
        originalQuery: "'test' eq partitionKEY",
        expectedQuery: '(eq "test" PartitionKey)'
      },
      {
        name: "Normalizes RowKey field",
        originalQuery: "'test' eq rowKEY",
        expectedQuery: '(eq "test" RowKey)'
      }
    ])
  })

  describe("Value Types", () => {
    runTestCases("Booleans", [
      {
        name: "Correctly handles boolean (true) values",
        originalQuery: "myBoolean eq true",
        expectedQuery: "(eq (id myBoolean) true)"
      },
      {
        name: "Correctly handles boolean (false) values",
        originalQuery: "myBoolean eq false",
        expectedQuery: "(eq (id myBoolean) false)"
      },
      {
        name: "Correctly handles boolean (true) values with variable casing",
        originalQuery: "myBoolean eq TRue",
        expectedQuery: "(eq (id myBoolean) true)"
      },
      {
        name: "Correctly handles boolean (false) values with variable casing",
        originalQuery: "myBoolean eq faLSE",
        expectedQuery: "(eq (id myBoolean) false)"
      }
    ])

    runTestCases("Doubles", [
      {
        name: "Correctly handles doubles",
        originalQuery: "myDouble lt 123.01",
        expectedQuery: "(lt (id myDouble) 123.01)"
      },
      {
        name: "Correctly handles doubles with a negative sign",
        originalQuery: "myDouble gt -123.01",
        expectedQuery: "(gt (id myDouble) -123.01)"
      }
    ])

    runTestCases("Integers", [
      {
        name: "Correctly handles integers",
        originalQuery: "myInt lt 123",
        expectedQuery: "(lt (id myInt) 123)"
      },
      {
        name: "Correctly handles integers with a negative sign",
        originalQuery: "myInt gt -123",
        expectedQuery: "(gt (id myInt) -123)"
      }
    ])

    runTestCases("Longs", [
      {
        name: "Correctly handles longs",
        originalQuery: "myInt lt 123.01L",
        expectedQuery: "(lt (id myInt) \"123.01\")"
      },
      {
        name: "Correctly handles longs with a negative sign",
        originalQuery: "myInt gt -123.01L",
        expectedQuery: "(gt (id myInt) \"-123.01\")"
      }
    ])

    runTestCases("Strings", [
      {
        name: "Correctly handles strings wrapped with apostrophes",
        originalQuery: "myString eq 'test'",
        expectedQuery: "(eq (id myString) \"test\")"
      },
      {
        name: "Correctly handles strings wrapped with double quotes",
        originalQuery: "myString eq \"test\"",
        expectedQuery: "(eq (id myString) \"test\")"
      },
      {
        name: "Correctly handles strings that look like boolean values",
        originalQuery: "myString eq 'true'",
        expectedQuery: "(eq (id myString) \"true\")"
      },
      {
        name: "Correctly handles strings that look like integer values",
        originalQuery: "myString eq '123'",
        expectedQuery: "(eq (id myString) \"123\")"
      }
    ])

    runTestCases("GUIDs", [
      {
        name: "Correctly handles GUIDs",
        originalQuery: "myGuid eq guid'12345678-1234-1234-1234-123456789012'",
        expectedQuery: "(eq (id myGuid) (guid 12345678-1234-1234-1234-123456789012))"
      },
      {
        name: "Correctly handles GUIDs with a variable casing",
        originalQuery: "myGuid eq GUID'12345678-1234-1234-1234-123456789012'",
        expectedQuery: "(eq (id myGuid) (guid 12345678-1234-1234-1234-123456789012))"
      },
      {
        name: "Correctly handles GUIDs in complex queries",
        originalQuery: "(PartitionKey eq '1168485761365502459') and (guidField ge guid'22222222-2222-2222-2222-222222222222')",
        expectedQuery: "(and ((eq PartitionKey \"1168485761365502459\")) ((gte (id guidField) (guid 22222222-2222-2222-2222-222222222222))))"
      }
    ])

    runTestCases("DateTimes", [
      {
        name: "Correctly handles DateTimes",
        originalQuery: "myDateTime eq datetime'2020-01-01T00:00:00.000Z'",
        expectedQuery: "(eq (id myDateTime) (datetime 2020-01-01T00:00:00.000Z))"
      },
      {
        name: "Correctly handles DateTimes with a variable casing",
        originalQuery: "myDateTime eq DATETIME'2020-01-01T00:00:00.000Z'",
        expectedQuery: "(eq (id myDateTime) (datetime 2020-01-01T00:00:00.000Z))"
      },
      {
        name: "Correctly handles DateTimes in a complex query",
        originalQuery: "myDateTime lt datetime'2020-01-01T00:00:00.000Z' and number gt 11 and PartitionKey eq 'partition1'",
        expectedQuery: "(and (lt (id myDateTime) (datetime 2020-01-01T00:00:00.000Z)) (and (gt (id number) 11) (eq PartitionKey \"partition1\")))"
      }
    ])

    runTestCases("Binary", [
      {
        name: "Correctly handles binary data with the binary'...' marker",
        originalQuery: "myBinary eq binary'62696e61727944617461'",
        expectedQuery: "(eq (id myBinary) (binary 62696e61727944617461))"
      },
      {
        name: "Correctly handles binary data with the binary'...' marker with variable casing",
        originalQuery: "myBinary eq BINARY'62696e61727944617461'",
        expectedQuery: "(eq (id myBinary) (binary 62696e61727944617461))"
      },
      {
        name: "Correctly handles binary data with the X'...' marker",
        originalQuery: "myBinary eq X'62696e61727944617461'",
        expectedQuery: "(eq (id myBinary) (binary 62696e61727944617461))"
      },
    ])
  })

  describe("Invalid Queries", () => {
    const testCases = [
      {
        name: "Invalid equality operator",
        query: "(1 === 1)"
      },
      {
        name: "Unexpected value (2)",
        query: "1 1"
      },
      {
        name: "Unexpected value (3)",
        query: "(1 1 1)"
      },
      {
        name: "Chained operators",
        query: "PartitionKey eq 'test' eq 'test2'"
      },
      {
        name: "Duplicate comparison operators",
        query: "PartitionKey eq eq 'test'"
      },
      {
        name: "Duplicate conditional operators",
        query: "PartitionKey eq 'test' and and number gt 11"
      }
    ]

    for (const testCase of testCases) {
      it(testCase.name, () => {
        assert.throws(() => parseQuery(testCase.query), Error, "it should throw an error an error while parsing")
      })
    }
  })
})