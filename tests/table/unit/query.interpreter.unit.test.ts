import * as assert from "assert";
import parseQuery from "../../../src/table/persistence/QueryInterpreter/QueryParser";
import { IQueryContext } from "../../../src/table/persistence/QueryInterpreter/IQueryContext";
import executeQuery from "../../../src/table/persistence/QueryInterpreter/QueryInterpreter";

describe("Query Interpreter", () => {
  function runTestCases(name: string, context: IQueryContext, testCases: {
    name: string
    originalQuery: string
    expectedResult: any
  }[]) {
    describe(name, () => {
      for (const test of testCases) {
        it(test.name, () => {
          const queryTree = parseQuery(test.originalQuery)
          assert.strictEqual(executeQuery(context, queryTree), test.expectedResult, "it should execute the query tree correctly")
        })
      }
    })
  }

  const referenceEntity = {
    PartitionKey: "testPartition",
    RowKey: "testRow",
    account: "testAccount",
    table: "testTable",
    properties: {
      test: "test",
      int32: 123,
      int64: "123.01",
      double: -123.01,
      bool: true,
      date: "2020-01-01T00:00:00.000Z",
      guid: Buffer.from("00000000-0000-0000-0000-000000000000").toString("base64"),
      guidLegacy: "00000000-0000-0000-0000-000000000000",
      binary: Buffer.from("binaryData").toString("base64"),
    }
  };

  describe("Built-in Identifiers", () => {
    runTestCases("PartitionKey", referenceEntity, [
      {
        name: "PartitionKey equality",
        originalQuery: "PartitionKey eq 'testPartition'",
        expectedResult: true
      },
      {
        name: "PartitionKey equality (doesn't match)",
        originalQuery: "PartitionKey eq 'testPartition2'",
        expectedResult: false
      }
    ])

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
        originalQuery: "PartitionKey eq 'testPartition' and RowKey gt 'testRoom' and RowKey lt 'testRoxy'",
        expectedResult: true
      },
      {
        name: "PartitionKey equality and RowKey range (doesn't match)",
        originalQuery: "PartitionKey eq 'testPartition' and RowKey gt 'testAnt' and RowKey lt 'testMoose'",
        expectedResult: false
      }
    ])

    runTestCases("TableName", referenceEntity, [
      {
        name: "TableName equality",
        originalQuery: "TableName eq 'testTable'",
        expectedResult: true
      },
      {
        name: "TableName equality (doesn't match)",
        originalQuery: "TableName eq 'testTable2'",
        expectedResult: false
      },
    ])
  })

  describe("Logical Operators", () => {
    runTestCases("and", referenceEntity, [
      {
        name: "PartitionKey equality and RowKey range",
        originalQuery: "PartitionKey eq 'testPartition' and RowKey gt 'testRoom' and RowKey lt 'testRoxy'",
        expectedResult: true
      },
      {
        name: "PartitionKey equality and RowKey range (doesn't match)",
        originalQuery: "PartitionKey eq 'testPartition' and RowKey gt 'testAnt' and RowKey lt 'testMoose'",
        expectedResult: false
      }
    ])

    runTestCases("or", referenceEntity, [
      {
        name: "PartitionKey set",
        originalQuery: "PartitionKey eq 'testPartition' or PartitionKey eq 'testPartition2'",
        expectedResult: true
      },
      {
        name: "PartitionKey set (doesn't match)",
        originalQuery: "PartitionKey eq 'testPartition2' or PartitionKey eq 'testPartition3'",
        expectedResult: false
      }
    ])

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
    ])
  })

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
        originalQuery: "guidLegacy eq guid'00000000-0000-0000-0000-000000000000'",
        expectedResult: true
      },
      {
        name: "GUID equality (legacy) (doesn't match)",
        originalQuery: "guidLegacy eq guid'00000000-0000-0000-0000-000000000001'",
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
    ])
  })

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
        originalQuery: "(true and RowKey eq 'testRow') and (false or PartitionKey eq 'testPartition')",
        expectedResult: true
      }
    ])

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
        originalQuery: "guidLegacy eq guid'00000000-0000-0000-0000-000000000000'",
        expectedResult: true
      },
      {
        name: "GUID equality (legacy) (doesn't match)",
        originalQuery: "guidLegacy eq guid'00000000-0000-0000-0000-000000000001'",
        expectedResult: false
      },
      {
        name: "GUID inequality (modern)",
        originalQuery: "guid ne guid'22222222-2222-2222-2222-222222222222'",
        expectedResult: true
      },
      {
        name: "GUID inequality (legacy)",
        originalQuery: "guidLegacy ne guid'22222222-2222-2222-2222-222222222222'",
        expectedResult: true
      }
    ])
  })
})