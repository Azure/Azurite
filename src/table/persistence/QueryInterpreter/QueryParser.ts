import AndNode from "./QueryNodes/AndNode";
import BinaryDataNode from "./QueryNodes/BinaryDataNode";
import ConstantNode from "./QueryNodes/ConstantNode";
import DateTimeNode from "./QueryNodes/DateTimeNode";
import EqualsNode from "./QueryNodes/EqualsNode";
import ExpressionNode from "./QueryNodes/ExpressionNode";
import GreaterThanEqualNode from "./QueryNodes/GreaterThanEqualNode";
import GreaterThanNode from "./QueryNodes/GreaterThanNode";
import GuidNode from "./QueryNodes/GuidNode";
import IQueryNode from "./QueryNodes/IQueryNode";
import IdentifierNode from "./QueryNodes/IdentifierNode";
import LessThanEqualNode from "./QueryNodes/LessThanEqualNode";
import LessThanNode from "./QueryNodes/LessThanNode";
import NotEqualsNode from "./QueryNodes/NotEqualsNode";
import NotNode from "./QueryNodes/NotNode";
import OrNode from "./QueryNodes/OrNode";
import PartitionKeyNode from "./QueryNodes/PartitionKeyNode";
import RowKeyNode from "./QueryNodes/RowKeyNode";
import TableNode from "./QueryNodes/TableNode";


export default function parseQuery(query: string): IQueryNode {
  return new QueryParser(query).visit()
}
class QueryParser {
  constructor(private query: string) {

  }

  private tokenPosition: number = 0

  visit(): IQueryNode {
    const tree = this.visitOr();

    if (this.tokenPosition < this.query.length) {
      this.parserException(`Unexpected token '${this.peek()}'.`)
    }

    return tree
  }

  private visitOr(): IQueryNode {
    const left = this.visitAnd();

    this.consumeWhitespace();
    if (this.consume("or")) {
      const right = this.visitOr();

      return new OrNode(left, right);
    } else {
      return left;
    }
  }

  private visitAnd(): IQueryNode {
    const left = this.visitUnary();

    this.consumeWhitespace();
    if (this.consume("and")) {
      const right = this.visitAnd();

      return new AndNode(left, right);
    } else {
      return left;
    }
  }

  private visitUnary(): IQueryNode {
    this.consumeWhitespace();
    const hasNot = this.consume("not")

    const right = this.visitExpressionGroup()

    if (hasNot) {
      return new NotNode(right);
    } else {
      return right;
    }
  }

  private visitExpressionGroup(): IQueryNode {
    this.consumeWhitespace();
    if (this.consume("(")) {
      const child = this.visitOr()

      this.consumeWhitespace();
      this.consume(")") || this.parserException(`Expected a ')' to close the expression group, but found '${this.peek()}' instead.`)

      return new ExpressionNode(child)
    } else {
      return this.visitBinary()
    }
  }

  private visitBinary(): IQueryNode {
    const left = this.visitIdentifierOrConstant()

    this.consumeWhitespace();
    const operator = this.consumeOneOf(true, "eq", "ne", "ge", "gt", "le", "lt")
    if (operator) {
      const right = this.visitIdentifierOrConstant()

      switch (operator) {
        case "eq":
          return new EqualsNode(left, right);
        case "ne":
          return new NotEqualsNode(left, right);
        case "ge":
          return new GreaterThanEqualNode(left, right);
        case "gt":
          return new GreaterThanNode(left, right);
        case "lt":
          return new LessThanNode(left, right);
        case "le":
          return new LessThanEqualNode(left, right);
      }
    }

    return left;
  }

  private visitIdentifierOrConstant(): IQueryNode {
    this.consumeWhitespace();

    const typedConstantIdentifier = this.consumeOneOf(true, "true", "false", "TableName", "PartitionKey", "RowKey", "guid'", "X'", "binary'", "datetime'")
    if (typedConstantIdentifier) {
      switch (typedConstantIdentifier) {
        case "true":
          return new ConstantNode(true);
        case "false":
          return new ConstantNode(false);
        case "TableName":
          return new TableNode();
        case "PartitionKey":
          return new PartitionKeyNode();
        case "RowKey":
          return new RowKeyNode();
        case "guid'":
          return new GuidNode(this.consumeWithTerminator("", c => c !== "'", "'")!);
        case "X'":
          return new BinaryDataNode(this.consumeWithTerminator("", c => c !== "'", "'")!);
        case "binary'":
          return new BinaryDataNode(this.consumeWithTerminator("", c => c !== "'", "'")!);
        case "datetime'":
          return new DateTimeNode(new Date(this.consumeWithTerminator("", c => c !== "'", "'")!));
        default:
          this.parserException(`Encountered unrecognized value type '${typedConstantIdentifier}' (this should never occur and indicates that the parser is missing a match arm).`);
      }
    }

    if ("-0123456789".includes(this.peek())) {
      return this.visitNumber();
    }

    if (`'"`.includes(this.peek())) {
      return this.visitString();
    }

    const identifier = this.take(c => c !== " ") || this.parserException(`Expected a valid identifier, but found ${this.peek()} instead.`);
    return new IdentifierNode(identifier)
  }

  private visitNumber(): IQueryNode {
    const isNegative = this.consume("-");
    const numerals = this.take(c => "0123456789.".includes(c));
    const isLong = this.consume("L");

    if (isLong) {
      return new ConstantNode(`${isNegative ? '-' : ''}${numerals}`)
    } else {
      return new ConstantNode((isNegative ? -1 : 1) * parseFloat(numerals))
    }
  }

  private visitString(): IQueryNode {
    const openCharacter = this.take()
    const content = this.take((c, last) => c !== openCharacter && last !== "\\")
    this.consume(openCharacter) || this.parserException(`Expected a \`${openCharacter}\` to close the string, but found ${this.peek()} instead.`);

    return new ConstantNode(content.replace("''", "'"))
  }

  private peek(): string {
    return this.query[this.tokenPosition]
  }

  private consumeWhitespace() {
    while (this.query[this.tokenPosition] === " ") {
      this.tokenPosition++
    }
  }

  private consume(sequence: string, ignoreCase: boolean = false): boolean {
    const normalize = ignoreCase ? (s: string) => s.toLowerCase() : (s: string) => s;

    if (normalize(this.query.substring(this.tokenPosition, this.tokenPosition + sequence.length)) === normalize(sequence)) {
      this.tokenPosition += sequence.length
      return true
    }

    return false
  }

  private consumeOneOf(ignoreCase: boolean = false, ...options: string[]): string | null {
    for (const option of options) {
      if (this.consume(option, ignoreCase)) {
        return option
      }
    }

    return null
  }

  private consumeWithTerminator(prefix: string, predicate: (char: string) => boolean, suffix: string): string | null {
    if (!this.consume(prefix)) {
      return null;
    }

    const value = this.take(predicate);
    this.consume(suffix) || this.parserException(`Expected "${suffix}" to close the "${prefix}...${suffix}", but found ${this.peek()} instead.`);

    return value;
  }

  private take(predicate?: (char: string, previous: string) => boolean): string {
    const start = this.tokenPosition
    let until = this.tokenPosition

    while (predicate && predicate(this.query[until], this.query[until - 1])) {
      until++
    }

    if (!predicate) {
      until++
    }

    this.tokenPosition = until
    return this.query.substring(start, until)
  }

  private parserException(message: string): never {
    throw new Error(`[query:${this.tokenPosition}]: ${message}`)
  }
}