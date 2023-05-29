# Table Query Interpreter
This directory contains the logic behind the Azurite Table query interpreter, which
is responsible for implementing the OData query API used to perform `$filter`-ing
of query results from a Table.

The interpreter is broken into several distinct layers.

## Components
### Lexer (`./QueryLexer.ts`)
The lexer is responsible for converting a query string into a sequence of tokens
which can be more easily parsed. In theory you don't need this component (the parser
can worry about how to break down these tokens) but in practice this tends to make
the parser easier to read and maintain by separating the logic of "how do we break this
into logical components" from the logic of "how do these components come together to
form a query?".

Effectively, the lexer takes a query string like
`PartitionKey eq 'test' and MyField ne guid"00000000-0000-0000-0000-000000000000"`
and converts it into the following tokens which can then be easily reasoned about:

- `identifier (PartitionKey)`
- `comparison-operator (eq)`
- `string (test)`
- `logic-operator (and)`
- `identifier (MyField)`
- `comparison-operator (ne)`
- `type-hint (guid)`
- `string (00000000-0000-0000-0000-000000000000)`

You'll immediately notice that this structure is "flat" and doesn't have any sense of
which tokens are associated with one another, that's the job of the parser...

### Parser (`./QueryParser.ts`)
The parser is responsible for taking a stream of tokens and constructing an Abstract
Syntax Tree (AST) representation based on the rules of the language. These rules are
commonly written in [EBNF](https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_form)
and describe the relationships between tokens.

For example, we might describe an `or` operation using the following format:

```
OR = AND ("or" OR)?
```

These components are then recursively resolved to build up a tree describing the query.
We use a **Recursive Descent** parsing strategy to achieve this, and you'll notice that
there are methods in `./QueryParser.ts` to do things like `visitOr()` and `visitAnd()`
which compose to provide this functionality.

```typescript
class QueryParser {
  visitOr(): IQueryNode {
    // We first visit the left hand side of the expression, which will return the most appropriate node for the left hand branch.
    const left = this.visitAnd();

    // If the next token is not the "and" operator, then we ignore the right hand side (it is optional)
    if (!this.tokens.next(t => t.kind == "logic-operation" && t.value == "or")) {
      return left;
    }

    // We recursively visit "OR" branches to allow queries like "x or y or z".
    const right = this.visitOr();

    return new OrNode(left, right);
  }
}
```

By combining this pattern, we can unambiguously parse the query into the correct
AST node representation, however if by the time we finish parsing there are still
tokens remaining in the stream (other than the `end-of-query` meta-token) we know
that the query was not valid. This can occur in scenarios like `x eq y eq z` which
is not a supported query structure for OData.

Something to pay attention to when implementing these methods is that the order of
traversal matters (i.e. if you have `visitAnd()` call `visitOr()` then `or` statements
will take precedence over `and` statements, and vice versa).

### AST (`./QueryNodes/*.ts`)
The parser's output is a tree structure that describes the query it processed, and this
tree is composed of nodes that describe the operations that should be executed by the
query. In the world of language parsing, this is called an "abstract syntax tree"
and the node classes in the `./QueryNodes` folder provide the types used to represent
it.

Each of these node types can have zero or more children and is required to implement the
`evaluate(context: IQueryContext)` method to resolve a runtime value for the query at
this point. For example, the `ConstantNode` may be used to represent the string value
`"hello"` and its `evaluate(context)` method will simply return `"hello"` as a result.

More complex node types like `EqualsNode` contain references to their `left` and `right`
child nodes, and we evaluate using a depth-first strategy here such that the
`evaluate(context)` method in the `EqualsNode` returns
the result of `left.evaluate(context) === right.evaluate(context)`.

As a result of this structure, the root node for the query will eventually evaluate
to a single value, which is the result of the query - and we're able to achieve this
without needing to dynamically emit code at runtime.

### Validator (`./QueryValidator.ts`)
The final step before we run a query is to perform some semantic validation against it.
There are certain queries which are not valid in the real world (like `1 eq 1`, which will
always return `true` and isn't practically querying anything) and the role of the validator
is to spot these issues and reject the query.

It does this by applying a visitor-style pattern which looks at the nodes in the AST to
determine whether they meet certain criteria. In our case, the only validation being
performed is that the query itself must reference at last one identifier (a property,
`PartitionKey`, `RowKey` or `TableName`).

## Future Improvements
The following are some of the potential future enhancements which may be made to this
parser/interpreter to improve its support for the Azure Table Storage query API.

### Type-Aware Queries (Breaking Change)
Currently queries are evaluated without regard for the data type they are representing.
This means that `123.0L eq '123.0'` is technically `true` even though the data types for
these two entities are clearly not the same. The same applies to `datetime`, `binary`,
`X`, and `guid` data types - which leaves plenty of room for queries to work in Azurite
but fail when they hit Azure Table Storage.

Unfortunately, introducing this change would be a backwards incompatible shift in the
Azurite API (which we need to be careful about).


That said, the way we would go about doing this would be to have the `IQueryNode.evaluate`
function return a typed data interface, something like the following:

```typescript
export interface TypedValue {
  value: any;
  type: "Undefined" | "Null" | "Edm.Guid" | "Edm.DateTime" | "Edm.Int64" | "Edm.Binary" | "Edm.Boolean" | "Edm.String" | "Edm.Int32" | "Edm.Double";
}
```

This would allow us to then compare type-wise equality for any of our operations, and the
`IdentifierNode` would be responsible for extracting the appropriate type from the `@odata.type`
meta-property when retrieving a field.