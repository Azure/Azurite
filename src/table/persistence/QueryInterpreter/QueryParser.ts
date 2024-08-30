import { QueryLexer, QueryTokenKind } from "./QueryLexer";
import AndNode from "./QueryNodes/AndNode";
import BigNumberNode from "./QueryNodes/BigNumberNode";
import BinaryDataNode from "./QueryNodes/BinaryDataNode";
import ConstantNode from "./QueryNodes/ConstantNode";
import DateTimeNode from "./QueryNodes/DateTimeNode";
import EqualsNode from "./QueryNodes/EqualsNode";
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


export default function parseQuery(query: string): IQueryNode {
  return new QueryParser(query).visit();
}

/**
 * A recursive descent parser for the Azure Table Storage $filter query syntax.
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
 *  - CONSTANT := NUMBER | STRING | BOOLEAN | DATETIME | GUID | BINARY
 *  - NUMBER := ("-" | "+")? [0-9]+ ("." [0-9]+)? ("L")?
 */
class QueryParser {
  constructor(query: string) {
    this.tokens = new QueryLexer(query);
  }

  private tokens: QueryLexer

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

    this.tokens.next(token => token.kind === "end-of-query") || this.throwUnexpectedToken("end-of-query");

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

    if (this.tokens.next(t => t.kind === "logic-operator" && t.value?.toLowerCase() === "or")) {
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

    if (this.tokens.next(t => t.kind === "logic-operator" && t.value?.toLowerCase() === "and")) {
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
    const hasNot = !!this.tokens.next(t => t.kind === "unary-operator" && t.value?.toLowerCase() === "not");

    const right = this.visitExpressionGroup();

    if (hasNot) {
      return new NotNode(right);
    } else {
      return right;
    }
  }

  /**
   * Visits the EXPRESSION_GROUP layer of the query syntax tree, returning the appropriate node.
   * 
   * EXPRESSION_GROUP := ("(" OR ")") | BINARY
   * 
   * @returns {IQueryNode}
   */
  private visitExpressionGroup(): IQueryNode {
    if (this.tokens.next(t => t.kind === "open-paren")) {
      const child = this.visitExpression();

      this.tokens.next(t => t.kind === "close-paren") || this.throwUnexpectedToken("close-paren");

      return child;
    } else {
      return this.visitBinary();
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
    const left = this.visitIdentifierOrConstant();

    const operator = this.tokens.next(t => t.kind === "comparison-operator");
    if (!operator) {
      return left;
    }

    const binaryOperators: {
      [type: string]: new (left: IQueryNode, right: IQueryNode) => IQueryNode
    } = {
      "eq": EqualsNode,
      "ne": NotEqualsNode,
      "ge": GreaterThanEqualNode,
      "gt": GreaterThanNode,
      "le": LessThanEqualNode,
      "lt": LessThanNode
    };

    const operatorType = binaryOperators[operator.value?.toLowerCase() || ""] || null;

    if (!operatorType) {
      throw new Error(`Got an unexpected operator '${operator?.value}' at :${operator?.position}, expected one of: ${Object.keys(binaryOperators).join(", ")}.`);
    }

    const right = this.visitIdentifierOrConstant();
    return new operatorType(left, right);
  }

  /**
   * Visits the IDENTIFIER_OR_CONSTANT layer of the query syntax tree, returning the appropriate node.
   * 
   * IDENTIFIER_OR_CONSTANT := (TYPE_HINT STRING) | NUMBER | STRING | BOOL | IDENTIFIER
   * 
   * @returns {IQueryNode}
   */
  private visitIdentifierOrConstant(): IQueryNode {

    switch (this.tokens.peek().kind) {
      case "identifier":
        return new IdentifierNode(this.tokens.next().value!);
      case "bool":
        return new ConstantNode(this.tokens.next().value?.toLowerCase() === "true");
      case "string":
        return new ConstantNode(this.tokens.next().value);
      case "number":
        return this.visitNumber();
      case "type-hint":
        return this.visitTypeHint();
      default:
        this.throwUnexpectedToken("identifier", "bool", "string", "number", "type-hint");
    }
  }

  private visitTypeHint(): IQueryNode {
    const typeHint = this.tokens.next(t => t.kind === "type-hint") || this.throwUnexpectedToken("type-hint");
    const value = this.tokens.next(t => t.kind === "string") || this.throwUnexpectedToken("string");

    switch (typeHint.value?.toLowerCase()) {
      case "datetime":
        return new DateTimeNode(value.value!);
      case "guid":
        return new GuidNode(value.value!);
      case "binary":
      case "x":
        return new BinaryDataNode(value.value!);
      default:
        throw new Error(`Got an unexpected type hint '${typeHint.value}' at :${typeHint.position} (this implies that the parser is missing a match arm).`);
    }
  }

  /**
   * Visits the NUMBER layer of the query syntax tree, returning the appropriate node.
   * 
   * NUMBER := ("-" | "+")? [0-9]+ ("." [0-9]+)? ("L")?
   * 
   * @returns {IQueryNode}
   */
  private visitNumber(): IQueryNode {
    const token = this.tokens.next(t => t.kind === "number") || this.throwUnexpectedToken("number");

    if (token.value!.endsWith("L")) {
      // This is a "long" number, which should be represented by its string equivalent
      return new BigNumberNode(token.value!.substring(0, token.value!.length - 1));
    } else {
      return new ConstantNode(parseFloat(token.value!));
    }
  }

  /**
   * Raises an exception if the next token in the query is not one of the expected tokens.
   * 
   * @param {QueryTokenKind} expected The type of tokens which were expected.
   */
  private throwUnexpectedToken(...expected: QueryTokenKind[]): never {
    const actualToken = this.tokens.peek();

    throw new Error(`Unexpected token '${actualToken.kind}' at ${actualToken.value || ''}:${actualToken.position}+${actualToken.length} (expected one of: ${expected.join(", ")}).`);
  }
}
