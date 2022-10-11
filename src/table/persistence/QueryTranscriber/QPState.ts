import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import { QueryType } from "./QueryType";
import { TaggedToken, TokenType } from "./TokenMap";

export default class QPState {
  /**
   * Processes the first opening parens of a query
   * @param context
   * @returns
   */
  protected processOpeningParens(
    context: QueryContext,
    token: string
  ): QueryContext {
    if (token.match(/\(/) && context.currentPos === 0) {
      const taggedToken: TaggedToken = ["(", TokenType.ParensOpen];
      context.taggedPredicates.push([[taggedToken], QueryType.parensOpen]);
      context.currentPos += 1;
    }
    return context;
  }

  /**
   * Processes the closing parens on a query
   * @param context
   * @returns
   */
  protected processClosingParens(context: QueryContext): QueryContext {
    if (context.originalQuery.match(/^\)/)) {
      const taggedToken: TaggedToken = [")", TokenType.ParensClose];
      context.taggedPredicates.push([[taggedToken], QueryType.parensClose]);
      context.currentPos += 1;
    }
    return context;
  }

  protected startofNextRelevantToken(
    context: QueryContext
  ): [QueryContext, number] {
    let pos = context.currentPos;
    let token = context.originalQuery[pos];
    let relevantTokenFound = false;
    while (relevantTokenFound === false && pos < context.originalQuery.length) {
      token = context.originalQuery[pos];
      switch (token) {
        case " ":
          pos += 1;
          context.currentPos += 1;
          break;
        default:
          relevantTokenFound = true;
          break;
      }
    }
    return [context, pos];
  }

  protected endOfToken(context: QueryContext, startPos: number): number {
    if (
      context.originalQuery[startPos] === "(" ||
      context.originalQuery[startPos] === ")"
    ) {
      return startPos + 1;
    }
    let pos = startPos + 1;
    let token = context.originalQuery[pos];
    let endTokenFound = false;
    while (endTokenFound === false && pos < context.originalQuery.length) {
      token = context.originalQuery[pos];
      switch (token) {
        case " ":
          endTokenFound = true;
          break;
        case "(":
          endTokenFound = true;
          break;
        case ")":
          endTokenFound = true;
          break;
        default:
          pos += 1;
          break;
      }
    }
    if (pos > context.originalQuery.length) {
      return context.originalQuery.length - 1;
    }
    return pos;
  }

  /**
   * Determines the next token.
   * @param context
   * @returns
   */
  protected determineNextToken(context: QueryContext): [QueryContext, string] {
    // detmermine what the next token should be.
    // logic:
    // from current position in query string
    // determine start if token:
    let tokenStart: number;
    [context, tokenStart] = this.startofNextRelevantToken(context);
    // determine end:
    const tokenEnd = this.endOfToken(context, tokenStart);
    return [context, context.originalQuery.slice(tokenStart, tokenEnd)];
  }

  protected handleToken(context: QueryContext, token: string): QueryContext {
    // categorize the token
    if (token === "(") {
      context.stateQueue.push(QueryStateName.PredicateStarted);
    } else if (token === ")") {
      context.stateQueue.push(QueryStateName.PredicateFinished);
    } else if (this.isOperand(token)) {
      // match operand (specific set)
      context.stateQueue.push(QueryStateName.ProcessOperator);
    } else if (this.isValue(token)) {
      // match number (long & doubles? needed)
      // match string (starts with ', or " ?)
      // match guid (is exactly guid'<guidval>')
      context.stateQueue.push(QueryStateName.ProcessValue);
    } else if (this.isIdentifier(token)) {
      // match identifier (can only start with letter)
      context.stateQueue.push(QueryStateName.ProcessIdentifier);
    }

    return context;
  }

  isValue(token: string): boolean {
    // match number (long & doubles? needed)
    // match string (starts with ', or " ?)
    // match guid (is exactly guid'<guidval>')
    // ToDo: Validate regex for Long value rep
    const match = token.match(/^L\d+|$^d+$|^guid'|^'|^"/);
    if (match !== null && match!.length > 0) {
      return true;
    }
    return false;
  }

  isIdentifier(token: string): boolean {
    const match = token.match(/^(?!guid')[a-zA-Z]/);
    if (match !== null && match!.length > 0) {
      return true;
    }
    return false;
  }

  protected isOperand(token: string): boolean {
    // ToDo: Validate performance vs regex or array / enum op
    let isOperator = true;
    switch (token) {
      case "eq":
        break;
      case "gt":
        break;
      case "ge":
        break;
      case "lt":
        break;
      case "le":
        break;
      case "ne":
        break;
      case "and":
        break;
      case "or":
        break;
      case "not":
        break;
      default:
        isOperator = false;
    }
    return isOperator;
  }
}
