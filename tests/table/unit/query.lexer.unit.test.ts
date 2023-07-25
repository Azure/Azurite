import assert from "assert";
import { QueryLexer } from "../../../src/table/persistence/QueryInterpreter/QueryLexer"

describe("Query Lexer", () => {
  function runTestCases(name: string, testCases: {
    name: string;
    query: string;
    tokens: string[];
  }[]) {
    describe(name, () => {
      for (const test of testCases) {
        it(test.name, () => {
          const lexer = new QueryLexer(test.query);

          const tokens = [];
          let token;
          while (token = lexer.next()) {
            tokens.push(token.kind);
            if (token.kind === "end-of-query") {
              break;
            }
          }

          assert.deepStrictEqual(tokens, test.tokens, "it should lex the query correctly");
        })
      }
    })
  }

  runTestCases("Simple Queries", [
    {
      name: "PartitionKey equality",
      query: "PartitionKey eq 'testPartition'",
      tokens: [
        "identifier",
        "comparison-operator",
        "string",
        "end-of-query"
      ]
    },
    {
      name: "Type Hints",
      query: "PartitionKey ne guid'00000000-0000-0000-0000-000000000000'",
      tokens: [
        "identifier",
        "comparison-operator",
        "type-hint",
        "string",
        "end-of-query"
      ]
    },
    {
      name: "Parenthesis",
      query: "(PartitionKey eq 'testPartition') and (RowKey eq 'testRow')",
      tokens: [
        "open-paren",
        "identifier",
        "comparison-operator",
        "string",
        "close-paren",
        "logic-operator",
        "open-paren",
        "identifier",
        "comparison-operator",
        "string",
        "close-paren",
        "end-of-query"
      ]
    },
    {
      name: "Not",
      query: "not (PartitionKey eq 'testPartition')",
      tokens: [
        "unary-operator",
        "open-paren",
        "identifier",
        "comparison-operator",
        "string",
        "close-paren",
        "end-of-query"
      ]
    },
    {
      name: "Not (no space)",
      query: "not(PartitionKey eq 'testPartition')",
      tokens: [
        "unary-operator",
        "open-paren",
        "identifier",
        "comparison-operator",
        "string",
        "close-paren",
        "end-of-query"
      ]
    },
    {
      name: "Type Hint name as identifier",
      query: "PartitionKey gt guid",
      tokens: [
        "identifier",
        "comparison-operator",
        "identifier",
        "end-of-query"
      ]
    },
    {
      name: "Strings with escaped characters (single-quotes)",
      query: "PartitionKey ge 'test''Partition'",
      tokens: [
        "identifier",
        "comparison-operator",
        "string",
        "end-of-query"
      ]
    },
    {
      name: "Strings with escaped characters (double-quotes)",
      query: "PartitionKey le \"test\"\"Partition\"",
      tokens: [
        "identifier",
        "comparison-operator",
        "string",
        "end-of-query"
      ]
    },
    {
      name: "Strings with escaped characters at the start and end",
      query: "PartitionKey lt '''''test'''''",
      tokens: [
        "identifier",
        "comparison-operator",
        "string",
        "end-of-query"
      ]
    },
    {
      name: "Booleans (true)",
      query: "PartitionKey eq true",
      tokens: [
        "identifier",
        "comparison-operator",
        "bool",
        "end-of-query"
      ]
    },
    {
      name: "Booleans (false)",
      query: "PartitionKey eq false",
      tokens: [
        "identifier",
        "comparison-operator",
        "bool",
        "end-of-query"
      ]
    }
  ]);
})