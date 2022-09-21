import QueryContext from "./QueryContext";
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
    if (context.originalQuery.match(/^\(/)) {
      const taggedToken: TaggedToken = ["(", TokenType.ParensOpen];
      context.taggedPredicates.push([[taggedToken], QueryType.parensOpen]);
      context.currentPos += 1;
    }
    return context;
  }

  protected nextRelevantToken(context: QueryContext): [QueryContext, string] {
    let token = "";
    let relevantTokenFound = false;
    while (relevantTokenFound === false) {
      token = context.originalQuery[context.currentPos];
      switch (token) {
        case " ":
          break;
        case ")":
          relevantTokenFound = true;
          break;
        default:
          relevantTokenFound = true;
          break;
      }
      context.currentPos += 1;
    }
    return [context, token];
  }

  /**
   * Determines the next token.
   * @param context
   * @returns
   */
  protected determineNextToken(context: QueryContext): [QueryContext, string] {
    let token = "";

    // detmermine what the next token should be.
    // logic:
    // from current position in query string
    // determine token:
    // match operand (specific set)
    [context, token] = this.matchOperand(context);

    // match identifier (can only start with letter)
    // match number (long & doubles? needed)
    // match string (starts with ', or " ?)
    // match guid (is exactly guid'<guidval>')
    // categorize the token

    return [context, token];
  }

  protected handleToken(context: QueryContext, token: string): QueryContext {
    context = this.processOpeningParens(context, token);
    return context;
  }

  private matchOperand(context: QueryContext): [QueryContext, string] {
    let token = "";
    token = context.originalQuery.slice(context.currentPos);
    token = token.match(/^(and|or)\s/) ? token.match(/^(and|or)\s/)![0] : "";
    return [context, token];
  }
}
