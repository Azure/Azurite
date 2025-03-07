import StorageError from "../../errors/StorageError";
import StorageErrorFactory from "../../errors/StorageErrorFactory";
import Context from "../../generated/Context";
import AndNode from "./QueryNodes/AndNode";
import ConstantNode from "./QueryNodes/ConstantNode";
import EqualsNode from "./QueryNodes/EqualsNode";
import ExpressionNode from "./QueryNodes/ExpressionNode";
import GreaterThanEqualNode from "./QueryNodes/GreaterThanEqualNode";
import GreaterThanNode from "./QueryNodes/GreaterThanNode";
import IQueryNode from "./QueryNodes/IQueryNode";
import KeyNode from "./QueryNodes/KeyNode";
import LessThanEqualNode from "./QueryNodes/LessThanEqualNode";
import LessThanNode from "./QueryNodes/LessThanNode";
import NotEqualsNode from "./QueryNodes/NotEqualsNode";
import OrNode from "./QueryNodes/OrNode";

/**
 * This file is used to parse query string for Azure Blob filter by tags and x-ms-if-tags conditions.
 * https://learn.microsoft.com/en-us/azure/storage/blobs/storage-manage-find-blobs?tabs=azure-portal
 * https://learn.microsoft.com/en-us/rest/api/storageservices/specifying-conditional-headers-for-blob-service-operations
 */

enum ComparisonType {
  Equal,
  Greater,
  Less,
  NotEqual
}

interface ComparisonNode {
  key: string;
  existedComparison: ComparisonType[];
}

export default function parseQuery(
  requestContext: Context,
  query: string,
  conditionsHeader?: string): IQueryNode {
  return new QueryParser(requestContext, query, conditionsHeader).visit()
}

/**
 * A recursive descent parser for Azure Blob filter by tags query syntax.
 *
 * This parser is implemented using a recursive descent strategy, which composes
 * layers of syntax hierarchy, roughly corresponding to the structure of an EBNF
 * grammar. Each layer of the hierarchy is implemented as a method which consumes
 * the syntax for that layer, and then calls the next layer of the hierarchy.
 *
 * So for example, the syntax tree that we currently use is composed of:
 *  - QUERY := EXPRESSION
 *  - EXPRESSION := OR
 *  - OR := AND ("or" OR)*
 *  - AND := UNARY ("and" AND)*
 *  - UNARY := ("not")? EXPRESSION_GROUP
 *  - EXPRESSION_GROUP := ("(" EXPRESSION ")") | BINARY
 *  - BINARY := IDENTIFIER_OR_CONSTANT (OPERATOR IDENTIFIER_OR_CONSTANT)?
 *  - IDENTIFIER_OR_CONSTANT := CONSTANT | IDENTIFIER
 *  - CONSTANT := STRING
 */
class QueryParser {
  constructor(
    requestContext: Context,
    query: string,
    conditionHeader?: string) {
    this.queryString = query;
    this.requestContext = requestContext;
    this.query = new ParserContext(this.requestContext, query, conditionHeader);
    this.conditionHeader = conditionHeader;
  }

  private requestContext: Context;
  private query: ParserContext;
  private comparisonNodes: Record<string, ComparisonNode> = {};
  private comparisonCount: number = 0;
  private conditionHeader?: string;
  private queryString: string;

  validateWithPreviousComparison(key: string, currentComparison: ComparisonType) {
    if (this.conditionHeader) return;
    if (currentComparison === ComparisonType.NotEqual) {
      return;
    }

    if (this.comparisonNodes[key]) {
      for (let i = 0; i < this.comparisonNodes[key].existedComparison.length; ++i) {
        if (currentComparison === ComparisonType.Equal) {
          throw new Error("can't have multiple conditions for a single tag unless they define a range");
        }

        if (currentComparison === ComparisonType.Greater &&
          (this.comparisonNodes[key].existedComparison[i] === ComparisonType.Greater
            || this.comparisonNodes[key].existedComparison[i] === ComparisonType.Equal)) {
          throw new Error("can't have multiple conditions for a single tag unless they define a range");
        }

        if (currentComparison === ComparisonType.Less &&
          (this.comparisonNodes[key].existedComparison[i] === ComparisonType.Less
            || this.comparisonNodes[key].existedComparison[i] === ComparisonType.Equal)) {
          throw new Error("can't have multiple conditions for a single tag unless they define a range");
        }
      }
    }

    return;
  }

  appendComparisonNode(key: string, currentComparison: ComparisonType) {
    if (this.conditionHeader) {
      return;
    }

    if (key !== '@container') {
      if (!this.comparisonNodes.hasOwnProperty(key)) {
        ++this.comparisonCount;
      }
    }

    if (this.comparisonCount > 10) {
      throw new StorageError(
        400,
        `InvalidQueryParameterValue`,
        `Error parsing query: there can be at most 10 unique tags in a query`,
        this.requestContext.contextId!,
        {
          QueryParameterName: `where`,
          QueryParameterValue: this.queryString
        });
    }

    if (this.comparisonNodes[key]) {
      this.comparisonNodes[key].existedComparison.push(currentComparison);
    }
    else {
      this.comparisonNodes[key] = {
        key: key,
        existedComparison: [currentComparison]
      }
    }
  }

  /**
   * Visits the root of the query syntax tree, returning the corresponding root node.
   *
   * @returns {IQueryNode}
   */
  visit(): IQueryNode {
    return this.visitQuery();
  }

  /**
   * Visits the QUERY layer of the query syntax tree, returning the appropriate node.
   *
   * @returns {IQueryNode}
   */
  private visitQuery(): IQueryNode {
    const tree = this.visitExpression();

    this.query.skipWhitespace();
    this.query.assertEndOfQuery();

    return tree;
  }

  /**
   * Visits the EXPRESSION layer of the query syntax tree, returning the appropriate node.
   *
   * EXPRESSION := OR
   *
   * @returns {IQueryNode}
   */
  private visitExpression(): IQueryNode {
    return this.visitOr();
  }

  /**
   * Visits the OR layer of the query syntax tree, returning the appropriate node.
   *
   * OR := AND ("or" OR)*
   *
   * @returns {IQueryNode}
   */
  private visitOr(): IQueryNode {
    const left = this.visitAnd();

    this.query.skipWhitespace();
    if (this.query.consume("or", true)) {
      if (!this.conditionHeader) {
        this.query.throw(`unexpected or`);
      }
      const right = this.visitOr();
      return new OrNode(left, right);
    } else {
      return left;
    }
  }

  /**
   * Visits the AND layer of the query syntax tree, returning the appropriate node.
   *
   * AND := UNARY ("and" AND)*
   *
   * @returns {IQueryNode}
   */
  private visitAnd(): IQueryNode {
    const left = this.visitUnary();

    this.query.skipWhitespace();
    if (this.query.consume("and", true)) {
      const right = this.visitAnd();

      return new AndNode(left, right);
    } else {
      return left;
    }
  }

  /**
   * Visits the UNARY layer of the query syntax tree, returning the appropriate node.
   *
   * UNARY := ("not")? EXPRESSION_GROUP
   *
   * @returns {IQueryNode}
   */
  private visitUnary(): IQueryNode {
    this.query.skipWhitespace();
    const right = this.visitExpressionGroup()
    return right;
  }

  /**
   * Visits the EXPRESSION_GROUP layer of the query syntax tree, returning the appropriate node.
   *
   * EXPRESSION_GROUP := ("(" OR ")") | BINARY
   *
   * @returns {IQueryNode}
   */
  private visitExpressionGroup(): IQueryNode {
    this.query.skipWhitespace();
    if (this.query.consume("(")) {
      const child = this.visitExpression()

      this.query.skipWhitespace();
      this.query.consume(")") || this.query.throw(`Expected a ')' to close the expression group, but found '${this.query.peek()}' instead.`)

      return new ExpressionNode(child)
    } else {
      return this.visitBinary()
    }
  }

  /**
   * Visits the BINARY layer of the query syntax tree, returning the appropriate node.
   *
   * BINARY := IDENTIFIER_OR_CONSTANT (OPERATOR IDENTIFIER_OR_CONSTANT)?
   *
   * @returns {IQueryNode}
   */
  private visitBinary(): IQueryNode {
    const left = this.visitKey();

    this.query.skipWhitespace();
    const operator = this.query.consumeOneOf(true, "=", ">=", "<=", "<>", ">", "<")
    if (operator) {
      const right = this.visitValue();

      switch (operator) {
        case "=":
          this.validateWithPreviousComparison(left.toString(), ComparisonType.Equal);
          this.appendComparisonNode(left.toString(), ComparisonType.Equal);
          return new EqualsNode(left, right);
        case "<>":
          if (!this.conditionHeader) {
            this.query.throw(`unexpected <>`);
          }
          this.validateWithPreviousComparison(left.toString(), ComparisonType.NotEqual);
          this.appendComparisonNode(left.toString(), ComparisonType.NotEqual);
          return new NotEqualsNode(left, right);
        case ">=":
          this.validateWithPreviousComparison(left.toString(), ComparisonType.Greater);
          this.appendComparisonNode(left.toString(), ComparisonType.Greater);
          return new GreaterThanEqualNode(left, right);
        case ">":
          this.validateWithPreviousComparison(left.toString(), ComparisonType.Greater);
          this.appendComparisonNode(left.toString(), ComparisonType.Greater);
          return new GreaterThanNode(left, right);
        case "<":
          this.validateWithPreviousComparison(left.toString(), ComparisonType.Less);
          this.appendComparisonNode(left.toString(), ComparisonType.Less);
          return new LessThanNode(left, right);
        case "<=":
          this.validateWithPreviousComparison(left.toString(), ComparisonType.Less);
          this.appendComparisonNode(left.toString(), ComparisonType.Less);
          return new LessThanEqualNode(left, right);
      }
    }

    return left;
  }

  /**
   * Visits the IDENTIFIER_OR_CONSTANT layer of the query syntax tree, returning the appropriate node.
   *
   * IDENTIFIER_OR_CONSTANT := CONSTANT | IDENTIFIER
   *
   * @returns {IQueryNode}
   */
  private visitValue(): IQueryNode {
    this.query.skipWhitespace();

    if (`'`.includes(this.query.peek())) {
      return this.visitString();
    }
    this.query.throw('expecting tag value');
  }

  private ContainsInvalidTagKeyCharacter(key: string): boolean {
    for (let c of key) {
      if (!(c >= 'a' && c <= 'z' ||
        c >= 'A' && c <= 'Z' ||
        c >= '0' && c <= '9' ||
        c == '_')) {
        return true;
      }
    }
    return false;
  }

  private validateKey(key: string) {
    if (key.startsWith("@")) {
      if (this.conditionHeader) {
        this.query.throw("");
      }

      if (key !== "@container") {
        this.query.throw(`unsupported parameter '${key}'`);
      }
      // Key is @container, no need for further check.
      return;
    }

    if (!this.conditionHeader && ((key.length == 0) || (key.length > 128))) {
      this.query.throw('tag must be between 1 and 128 characters in length');
    }
    if (this.ContainsInvalidTagKeyCharacter(key)) {
      this.query.throw(`unexpected '${key}'`);
    }
  }

  private validateValue(value: string) {
    if (!this.conditionHeader && (value.length > 256)) {
      this.query.throw(`tag value must be between 0 and 256 characters in length`);
    }
    for (let c of value) {
      if (!(c >= 'a' && c <= 'z' ||
        c >= 'A' && c <= 'Z' ||
        c >= '0' && c <= '9' ||
        c == ' ' ||
        c == '+' ||
        c == '-' ||
        c == '.' ||
        c == '/' ||
        c == ':' ||
        c == '=' ||
        c == '_')) {
        this.query.throw(`'${c}' not permitted in tag name or value`);
      }
    }
  }

  /**
   * Visits the STRING layer of the query syntax tree, returning the appropriate node.
   *
   * Strings are wrapped in either single quotes (') or double quotes (") and may contain
   * doubled-up quotes to introduce a literal.
   */
  private visitString(isAKey: boolean = false): IQueryNode {
    const openCharacter = this.query.take()

    /**
     * Strings are terminated by the same character that opened them.
     * But we also allow doubled-up characters to represent a literal, which means we need to only terminate a string
     * when we receive an odd-number of closing characters followed by a non-closing character.
     *
     * Conceptually, this is represented by the following state machine:
     *
     * - start: normal
     * - normal+(current: !') -> normal
     * - normal+(current: ', next: ') -> escaping
     * - normal+(current: ', next: !') -> end
     * - escaping+(current: ') -> normal
     *
     * We can implement this using the state field of the `take` method's predicate.
     */
    const content = this.query.take((c, peek, state) => {
      if (state === "escaping") {
        return "normal";
      } else if (c === openCharacter && peek === openCharacter) {
        return "escaping";
      } else if (c !== openCharacter) {
        return "normal";
      } else {
        return false;
      }
    });

    this.query.consume(openCharacter) || this.query.throw(`Expected a \`${openCharacter}\` to close the string, but found ${this.query.peek()} instead.`);

    if (isAKey) {
      const keyName = content.replace(new RegExp(`${openCharacter}${openCharacter}`, 'g'), openCharacter);
      this.validateKey(keyName);
      return new KeyNode(keyName);
    }
    else {
      const value = content.replace(new RegExp(`${openCharacter}${openCharacter}`, 'g'), openCharacter);
      this.validateValue(value);
      return new ConstantNode(value);
    }
  }

  /**
   * Visits the IDENTIFIER layer of the query syntax tree, returning the appropriate node.
   *
   * Identifiers are a sequence of characters which are not whitespace.
   *
   * @returns {IQueryNode}
   */
  private visitKey(): IQueryNode {
    // A key name can be surrounded by double quotes.
    if (`"`.includes(this.query.peek())) {
      return this.visitString(true);
    }
    else {
      const identifier = this.query.take(
        c => !!c.trim() && c !== '=' && c != '>' && c !== '<'
      ) || this.query.throw(`Expected a valid identifier, but found '${this.query.peek()}' instead.`);
      this.validateKey(identifier);
      return new KeyNode(identifier)
    }
  }
}

/**
 * Provides the logic and helper functions for consuming tokens from a query string.
 * This includes low level constructs like peeking at the next character, consuming a
 * specific sequence of characters, and skipping whitespace.
 */
export class ParserContext {
  constructor(
    private requestContext: Context,
    private query: string,
    private conditionHeader?: string) {
  }
  private tokenPosition: number = 0;

  /**
   * Asserts that the query has been fully consumed.
   *
   * This method should be called after the parser has finished consuming the known parts of the query.
   * Any remaining query after this point is indicative of a syntax error.
   */
  assertEndOfQuery() {
    if (this.tokenPosition < this.query.length) {
      this.throw(`Unexpected token '${this.peek()}'.`)
    }
  }

  /**
   * Retrieves the next character in the query without advancing the parser.
   *
   * @returns {string} A single character, or `undefined` if the end of the query has been reached.
   */
  peek(): string {
    return this.query[this.tokenPosition]
  }

  /**
   * Advances the parser past any whitespace characters.
   */
  skipWhitespace() {
    while (this.query[this.tokenPosition] && !this.query[this.tokenPosition].trim()) {
      this.tokenPosition++
    }
  }

  /**
   * Attempts to consume a given sequence of characters from the query,
   * advancing the parser if the sequence is found.
   *
   * @param {string} sequence The sequence of characters which should be consumed.
   * @param {boolean} ignoreCase Whether or not the case of the characters should be ignored.
   * @returns {boolean} `true` if the sequence was consumed, `false` otherwise.
   */
  consume(sequence: string, ignoreCase: boolean = false): boolean {
    const normalize = ignoreCase ? (s: string) => s.toLowerCase() : (s: string) => s;

    if (normalize(this.query.substring(this.tokenPosition, this.tokenPosition + sequence.length)) === normalize(sequence)) {
      this.tokenPosition += sequence.length
      return true
    }

    return false
  }

  /**
   * Attempts to consume one of a given set of sequences from the query,
   * advancing the parser if one of the sequences is found.
   *
   * Sequences are tested in the order they are provided, and the first
   * sequence which is found is consumed. As such, it is important to
   * avoid prefixes appearing before their longer counterparts.
   *
   * @param {boolean} ignoreCase Whether or not the case of the characters should be ignored.
   * @param {string[]} options The list of character sequences which should be consumed.
   * @returns {string | null} The sequence which was consumed, or `null` if none of the sequences were found.
   */
  consumeOneOf(ignoreCase: boolean = false, ...options: string[]): string | null {
    for (const option of options) {
      if (this.consume(option, ignoreCase)) {
        return option
      }
    }

    return null
  }

  /**
   * Consumes a sequence of characters from the query based on a character predicate function.
   *
   * The predicate function is called for each character in the query, and the sequence is
   * consumed until the predicate returns `false` or the end of the query is reached.
   *
   * @param {Function} predicate The function which determines which characters should be consumed.
   * @returns {string} The sequence of characters which were consumed.
   */
  take<T>(predicate?: (char: string, peek: string, state: T | undefined) => T): string {
    const start = this.tokenPosition
    let until = this.tokenPosition

    if (predicate) {
      let state: T | undefined;
      while (this.query[until]) {
        state = predicate(this.query[until], this.query[until + 1], state)
        if (!state) {
          break
        }

        until++;
      }
    } else {
      // If no predicate is provided, then just take one character
      until++
    }

    this.tokenPosition = until
    return this.query.substring(start, until)
  }

  /**
   * Consumes a sequence of characters from the query based on a character predicate function,
   * and then consumes a terminating sequence of characters (throwing an exception if these are not found).
   *
   * This function is particularly useful for consuming sequences of characters which are surrounded
   * by a prefix and suffix, such as strings.
   *
   * @param {string} prefix The prefix which should be consumed.
   * @param {Function} predicate The function which determines which characters should be consumed.
   * @param {string} suffix The suffix which should be consumed.
   * @returns {string | null} The sequence of characters which were consumed, or `null` if the prefix was not found.
   */
  takeWithTerminator<T>(prefix: string, predicate: (char: string, peek: string, state: T | undefined) => T, suffix: string): string | null {
    if (!this.consume(prefix)) {
      return null;
    }

    const value = this.take(predicate);
    this.consume(suffix) || this.throw(`Expected "${suffix}" to close the "${prefix}...${suffix}", but found '${this.peek()}' instead.`);

    return value;
  }

  /**
   * Throws an exception with a message indicating the position of the parser in the query.
   * @param {string} message The message to include in the exception.
   */
  throw(message: string): never {
    if (this.conditionHeader) {
      throw StorageErrorFactory.getInvalidHeaderValue(
        this.requestContext.contextId!, {
        HeaderName: this.conditionHeader,
        HeaderValue: this.query
      });
    }
    else {
      throw new StorageError(
        400,
        `InvalidQueryParameterValue`,
        `Error parsing query at or near character position ${this.tokenPosition}: ${message}`,
        this.requestContext.contextId!,
        {
          QueryParameterName: `where`,
          QueryParameterValue: this.query
        });
    }
  }
}