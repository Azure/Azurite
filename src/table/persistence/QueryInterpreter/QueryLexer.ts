
export type QueryTokenKind = "identifier" | "bool" | "number" | "type-hint" | "string" | "open-paren" | "close-paren" | "unary-operator" | "comparison-operator" | "logic-operator" | "end-of-query";

/**
 * Represents a single token in the query which can then be consumed by
 * the parser to build the query tree. Each token consists of a token kind,
 * a position in the query string, and a length. It may optionally also contain
 * a value to uniquely distinguish between tokens of the same kind..
 */
export interface QueryToken {
  kind: QueryTokenKind;
  position: number;
  length: number;
  value?: string;
}

/**
 * This is the lexer responsible for converting a query string into a stream of tokens.
 * These tokens are logical chunks of the query which can then be consumed by the parser,
 * while not technically necessary, this does help simplify the parsing logic (allowing it
 * to operate on the higher-level tokens directly).
 */
export class QueryLexer {
  constructor(private query: string) { }

  private tokenPosition: number = 0;

  /**
   * The list of comparison operators which are supported by the query syntax.
   */
  private comparisonOperators: string[] = [
    "eq",
    "ne",
    "gt",
    "ge",
    "lt",
    "le",
  ];

  /**
   * The list of unary operators which are supported by the query syntax.
   */
  private unaryOperators: string[] = [
    "not",
  ];

  /**
   * The list of logic operators which are supported by the query syntax.
   */
  private logicOperators: string[] = [
    "and",
    "or",
  ];

  /**
   * The list of type hints which are supported by the query syntax.
   * Type hints are used to explicitly specify the type of a value
   * when it cannot be inferred from the value itself, such as a
   * GUID or a binary data (which are represented as strings).
   * 
   * Type hints are specified by prefixing the value with the hint
   * e.g. `guid'00000000-0000-0000-0000-000000000000'`.
   */
  private typeHints: string[] = [
    "datetime",
    "guid",
    "binary",
    "x"
  ];

  /**
   * Gets the next token from the query stream, advancing the token stream.
   * Optionally, you may restrict the type of token returned by providing
   * a predicate which will be used to evaluate the token's suitability
   * for consumption.
   * 
   * @returns {QueryToken}
   */
  next(): QueryToken;
  next(predicate: (token: QueryToken) => boolean): QueryToken | null;
  next(predicate?: (token: QueryToken) => boolean): QueryToken | null {
    const token = this.peek();

    if (!predicate || predicate(token)) {
      this.tokenPosition = token.position + token.length;
      return token;
    } else {
      return null;
    }
  }

  /**
   * Gets the next token in the query string without advancing the token stream.
   * 
   * @returns {QueryToken}
   */
  peek(): QueryToken {
    // We ignore whitespace (tabs, spaces, newlines etc) in the lead-up to a token
    this.skipWhitespace();

    // If we're at the end of the query, then return an end-of-query token
    if (!this.query[this.tokenPosition]) {
      return {
        kind: "end-of-query",
        position: this.tokenPosition,
        length: 0
      };
    }

    // We have a few special control characters which are composed of single tokens,
    // namely the parentheses "()" which are used to group expressions, and the quotes
    // ("') which are used to delimit strings.
    switch (this.query[this.tokenPosition]) {
      case "(":
        return { kind: "open-paren", position: this.tokenPosition, length: 1 };
      case ")":
        return { kind: "close-paren", position: this.tokenPosition, length: 1 };
      case '"':
      case "'":
        return this.peekString();
      default:
        // If we encounter any other character, it is safe for us to proceed to the next token.
        break;
    }

    // If we get to this point, we're looking for either an operator, an identifier, a number, or a type hint.
    // All of these cases are delimited by the above control characters, or by whitespace/end of query.
    return this.peekWord();
  }

  private peekString(): QueryToken {
    const start = this.tokenPosition;
    const openCharacter = this.query[start];

    let position = start + 1;
    while (this.query[position]) {
      if (this.query[position] === openCharacter && this.query[position + 1] === openCharacter) {
        position += 2;
      } else if (this.query[position] === openCharacter) {
        position++;
        break;
      } else {
        position++;
      }
    }

    return { kind: "string", position: start, length: position - start, value: this.query.substring(start + 1, position - 1).replace(new RegExp(`${openCharacter}${openCharacter}`, 'g'), openCharacter) };
  }

  private peekWord(): QueryToken {
    const controlCharacters = `()"'`;

    const start = this.tokenPosition;
    let position = this.tokenPosition;
    while (this.query[position]?.trim() && !controlCharacters.includes(this.query[position])) {
      position++;
    }

    // At this point we've got the delimited token, but we need to determine whether it's one of
    // our special keywords or an identifier. We can do this by checking against a list of known
    const value = this.query.substring(start, position);

    if (this.logicOperators.includes(value.toLowerCase())) {
      return { kind: "logic-operator", position: start, length: value.length, value };
    }

    if (this.unaryOperators.includes(value.toLowerCase())) {
      return { kind: "unary-operator", position: start, length: value.length, value };
    }

    if (this.comparisonOperators.includes(value.toLowerCase())) {
      return { kind: "comparison-operator", position: start, length: value.length, value };
    }

    if (value.toLowerCase() === "true" || value.toLowerCase() === "false") {
      return { kind: "bool", position: start, length: value.length, value };
    }

    if (this.typeHints.includes(value.toLowerCase()) && `'"`.includes(this.query[position])) {
      return { kind: "type-hint", position: start, length: value.length, value };
    }

    if (value.match(/^-?[0-9]+(\.[0-9]+)?L?$/)) {
      return { kind: "number", position: start, length: value.length, value };
    }

    return { kind: "identifier", position: start, length: value.length, value };
  }

  private skipWhitespace() {
    while (this.query[this.tokenPosition] && !this.query[this.tokenPosition].trim()) {
      this.tokenPosition++;
    }
  }
}
