import * as assert from "assert";
import LokiJsQueryTranscriberFactory from "../../../src/table/persistence/QueryTranscriber/LokiJsQueryTranscriberFactory";

const entityQueries = [
  {
    input: "PartitionKey eq 'azurite' and RowKey eq 'tables'",
    expected:
      "return ( item.properties.PartitionKey === `azurite` && item.properties.RowKey === `tables` )"
  },
  {
    input: "PartitionKey eq 'azurite' or RowKey eq 'tables'",
    expected:
      "return ( item.properties.PartitionKey === `azurite` || item.properties.RowKey === `tables` )"
  },
  {
    input: "PartitionKey eq 'Foo '''' Bar'",
    expected: "return ( item.properties.PartitionKey === `Foo '' Bar` )"
  },
  {
    input: "PartitionKey eq 'Foo '' Bar'",
    expected: "return ( item.properties.PartitionKey === `Foo ' Bar` )"
  },
  {
    input: "not (PartitionKey lt 'Part2')",
    expected: "return ( ! ( item.properties.PartitionKey < `Part2` ) )"
  },
  {
    input: "PartitionKey eq 'azurite'",
    expected: "return ( item.properties.PartitionKey === `azurite` )"
  },
  {
    input: "RowKey eq 'azurite'",
    expected: "return ( item.properties.RowKey === `azurite` )"
  },
  {
    input: "PartitionKey gt 'azurite'",
    expected: "return ( item.properties.PartitionKey > `azurite` )"
  },
  {
    input: "PartitionKey ge 'azurite'",
    expected: "return ( item.properties.PartitionKey >= `azurite` )"
  },
  {
    input: "PartitionKey lt 'azurite'",
    expected: "return ( item.properties.PartitionKey < `azurite` )"
  },
  {
    input: "PartitionKey le 'azurite'",
    expected: "return ( item.properties.PartitionKey <= `azurite` )"
  },
  {
    input: "PartitionKey ne 'azurite'",
    expected: "return ( item.properties.PartitionKey !== `azurite` )"
  },
  {
    input: "not (PartitionKey eq 'azurite')",
    expected: "return ( ! ( item.properties.PartitionKey === `azurite` ) )"
  },
  {
    input: "MyField gt datetime'2021-06-05T16:20:00'",
    expected:
      "return ( new Date(item.properties.MyField).getTime() > new Date('2021-06-05T16:20:00').getTime() )"
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
    input: "MyField eq guid'00000000-0000-0000-0000-000000000000'",
    expected:
      "return ( ( item.properties.MyField === '00000000-0000-0000-0000-000000000000' ) || ( item.properties.MyField === 'MDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAw' ) )"
  },
  {
    input: "PartitionKey eq 'Iam''good''atTypeScript'",
    expected:
      "return ( item.properties.PartitionKey === `Iam'good'atTypeScript` )"
  },
  {
    input: "PartitionKey eq 'Isn''tThisANastyPK'",
    expected: "return ( item.properties.PartitionKey === `Isn'tThisANastyPK` )"
  },
  {
    input: "1 eq 1",
    expected: "return ( 1 === 1 )"
  },
  {
    input: "PartitionKey eq 'a'",
    expected: "return ( item.properties.PartitionKey === `a` )"
  },
  {
    input: "PartitionKey eq ' '",
    expected: "return ( item.properties.PartitionKey === ` ` )"
  },
  {
    input: "PartitionKey eq 'Foo Bar'",
    expected: "return ( item.properties.PartitionKey === `Foo Bar` )"
  },
  {
    input: "PartitionKey eq 'A''Foo Bar''Z'",
    expected: "return ( item.properties.PartitionKey === `A'Foo Bar'Z` )"
  },
  {
    input: "PartitionKey eq '''Foo Bar'",
    expected: "return ( item.properties.PartitionKey === `'Foo Bar` )"
  },
  {
    input: "PartitionKey eq 'Foo Bar'''",
    expected: "return ( item.properties.PartitionKey === `Foo Bar'` )"
  },
  {
    input: "PartitionKey eq ' Foo Bar '",
    expected: "return ( item.properties.PartitionKey === ` Foo Bar ` )"
  },
  {
    input: "PartitionKey eq ''",
    expected: "return ( item.properties.PartitionKey === `` )"
  },
  {
    input: "PartitionKey eq '''Foo Bar'''",
    expected: "return ( item.properties.PartitionKey === `'Foo Bar'` )"
  },
  {
    input: "PartitionKey eq ''''",
    expected: "return ( item.properties.PartitionKey === `'` )"
  },
  {
    input: "PartitionKey eq ''''''",
    expected: "return ( item.properties.PartitionKey === `''` )"
  },
  {
    input: "PartitionKey eq ''''''''",
    expected: "return ( item.properties.PartitionKey === `'''` )"
  },
  {
    input: "PartitionKey eq ''''''''''",
    expected: "return ( item.properties.PartitionKey === `''''` )"
  },
  {
    input: "PartitionKey eq 'I am ''good'' at TypeScript'",
    expected:
      "return ( item.properties.PartitionKey === `I am 'good' at TypeScript` )"
  },
  {
    input: "_foo eq 'bar'",
    expected: "return ( item.properties._foo === `bar` )"
  },
  {
    input:
      "please eq 'never query ''this'' eq this or suchandsuch eq ''worse'''",
    expected:
      "return ( item.properties.please === `never query 'this' eq this or suchandsuch eq 'worse'` )"
  }
];

describe("Unit tests for converting an entity OData query to a JavaScript query for LokiJS", () => {
  entityQueries.forEach(({ input, expected }) => {
    it(`should transform '${input}' into '${expected}'`, (done) => {
      try {
        const queryTranscriber =
          LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
            input,
            "lokiJsQueryTranscriber"
          );

        queryTranscriber.transcribe();
        const actual = queryTranscriber.getTranscribedQuery();
        assert.strictEqual(actual, expected);
      } catch (err: any) {
        if (input === "1 eq 1") {
          assert.strictEqual(
            err.message,
            "Invalid number of terms in query!",
            `Did not get expected error on invalid query ${input}`
          );
        } else {
          assert.ifError(err);
        }
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

describe("Unit tests for converting an table OData query to a JavaScript query for LokiJS", () => {
  tableQueries.forEach(({ input, expected }) => {
    it(`should transform '${input}' into '${expected}'`, (done) => {
      try {
        const queryTranscriber =
          LokiJsQueryTranscriberFactory.createTableQueryTranscriber(
            input,
            "lokiJsTableQueryTranscriber"
          );

        queryTranscriber.transcribe();

        const actual = queryTranscriber.getTranscribedQuery();
        assert.strictEqual(actual, expected);
      } catch (err: any) {
        if (input === "1 eq 1")
          assert.strictEqual(
            err.message,
            "Invalid number of terms in query!",
            `Did not get expected error on invalid query ${input}`
          );
      }
      done();
    });
  });
});
