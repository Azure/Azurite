import * as assert from "assert";
import LokiTableStoreQueryGenerator from "../../../src/table/persistence/LokiTableStoreQueryGenerator";

const entityQueries = [
  {
    input: "PartitionKey eq 'azurite'",
    expected: "return ( item.PartitionKey === `azurite` )"
  },
  {
    input: "RowKey eq 'azurite'",
    expected: "return ( item.RowKey === `azurite` )"
  },
  {
    input: "PartitionKey gt 'azurite'",
    expected: "return ( item.PartitionKey > `azurite` )"
  },
  {
    input: "PartitionKey ge 'azurite'",
    expected: "return ( item.PartitionKey >= `azurite` )"
  },
  {
    input: "PartitionKey lt 'azurite'",
    expected: "return ( item.PartitionKey < `azurite` )"
  },
  {
    input: "PartitionKey le 'azurite'",
    expected: "return ( item.PartitionKey <= `azurite` )"
  },
  {
    input: "PartitionKey ne 'azurite'",
    expected: "return ( item.PartitionKey !== `azurite` )"
  },
  {
    input: "not (PartitionKey eq 'azurite')",
    expected: "return ( ! ( item.PartitionKey === `azurite` ) )"
  },
  {
    input: "MyField gt datetime'2021-06-05T16:20:00'",
    expected:
      "return ( new Date(item.properties.MyField).getTime() > new Date(`2021-06-05T16:20:00`).getTime() )"
  },
  {
    input: "MyField gt 1337",
    expected: "return ( item.properties.MyField > 1337 )"
  },
  {
    input: "MyField gt 1337L",
    expected: "return ( item.properties.MyField > '1337' )"
  },
  {
    input: "PartitionKey eq 'azurite' and RowKey eq 'tables'",
    expected:
      "return ( item.PartitionKey === `azurite` && item.RowKey === `tables` )"
  },
  {
    input: "PartitionKey eq 'azurite' or RowKey eq 'tables'",
    expected:
      "return ( item.PartitionKey === `azurite` || item.RowKey === `tables` )"
  },
  {
    input: "MyField eq guid'00000000-0000-0000-0000-000000000000'",
    expected:
      "return ( item.properties.MyField === `00000000-0000-0000-0000-000000000000` )"
  },
  {
    input: "PartitionKey eq 'Iam''good''atTypeScript'",
    expected: "return ( item.PartitionKey === `Iam'good'atTypeScript` )"
  },
  {
    input: "PartitionKey eq 'Isn''tThisANastyPK'",
    expected: "return ( item.PartitionKey === `Isn'tThisANastyPK` )"
  },
  {
    input: "1 eq 1",
    expected: "return ( 1 === 1 )"
  },
  {
    input: "PartitionKey eq 'a'",
    expected: "return ( item.PartitionKey === `a` )"
  },
  {
    input: "PartitionKey eq ' '",
    expected: "return ( item.PartitionKey === ` ` )"
  },
  {
    input: "PartitionKey eq 'Foo Bar'",
    expected: "return ( item.PartitionKey === `Foo Bar` )"
  },
  {
    input: "PartitionKey eq 'A''Foo Bar''Z'",
    expected: "return ( item.PartitionKey === `A'Foo Bar'Z` )"
  },
  {
    input: "PartitionKey eq '''Foo Bar'",
    expected: "return ( item.PartitionKey === `'Foo Bar` )"
  },
  {
    input: "PartitionKey eq 'Foo '' Bar'",
    expected: "return ( item.PartitionKey === `Foo ' Bar` )"
  },
  {
    input: "PartitionKey eq 'Foo Bar'''",
    expected: "return ( item.PartitionKey === `Foo Bar'` )"
  },
  {
    input: "PartitionKey eq ' Foo Bar '",
    expected: "return ( item.PartitionKey === ` Foo Bar ` )"
  },
  {
    input: "PartitionKey eq ''",
    expected: "return ( item.PartitionKey === `` )"
  },
  {
    input: "PartitionKey eq '''Foo Bar'''",
    expected: "return ( item.PartitionKey === `'Foo Bar'` )"
  },
  {
    input: "PartitionKey eq ''''",
    expected: "return ( item.PartitionKey === `'` )"
  },
  {
    input: "PartitionKey eq ''''''",
    expected: "return ( item.PartitionKey === `''` )"
  },
  {
    input: "PartitionKey eq ''''''''",
    expected: "return ( item.PartitionKey === `'''` )"
  },
  {
    input: "PartitionKey eq ''''''''''",
    expected: "return ( item.PartitionKey === `''''` )"
  },
  {
    input: "PartitionKey eq 'I am ''good'' at TypeScript'",
    expected: "return ( item.PartitionKey === `I am 'good' at TypeScript` )"
  }
];

describe("unit tests for converting an entity OData query to a JavaScript query for LokiJS", () => {
  entityQueries.forEach(({ input, expected }) => {
    it(`should transform '${input}' into '${expected}'`, (done) => {
      try {
        const actual = LokiTableStoreQueryGenerator.transformEntityQuery(input);
        assert.strictEqual(actual, expected);
      } catch (err: any) {
        if (input === "1 eq 1")
          assert.strictEqual(
            err.message,
            "Invalid token after value",
            `Did not get expected error on invalid query ${input}`
          );
      }
      done();
    });
  });
});

const tableQueries = [
  {
    input: "TableName eq 'azurite'",
    expected: "return ( item.table === `azurite` )"
  },
  {
    input: "TableName gt 'azurite'",
    expected: "return ( item.table > `azurite` )"
  },
  {
    input: "TableName ge 'azurite'",
    expected: "return ( item.table >= `azurite` )"
  },
  {
    input: "TableName lt 'azurite'",
    expected: "return ( item.table < `azurite` )"
  },
  {
    input: "TableName le 'azurite'",
    expected: "return ( item.table <= `azurite` )"
  },
  {
    input: "TableName ne 'azurite'",
    expected: "return ( item.table !== `azurite` )"
  },
  {
    input: "not (TableName eq 'azurite')",
    expected: "return ( ! ( item.table === `azurite` ) )"
  },
  {
    input: "1 eq 1",
    expected: "return ( 1 === 1 )"
  }
];

describe("unit tests for converting an table OData query to a JavaScript query for LokiJS", () => {
  tableQueries.forEach(({ input, expected }) => {
    it(`should transform '${input}' into '${expected}'`, (done) => {
      try {
        const actual = LokiTableStoreQueryGenerator.transformTableQuery(input);
        assert.strictEqual(actual, expected);
      } catch (err: any) {
        if (input === "1 eq 1")
          assert.strictEqual(
            err.message,
            "Invalid token after value",
            `Did not get expected error on invalid query ${input}`
          );
      }
      done();
    });
  });
});
