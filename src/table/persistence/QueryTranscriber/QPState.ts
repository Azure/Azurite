import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import { PredicateType } from "./PredicateType";
import { TokenMap } from "./TokenMap";
import TaggedToken from "./TaggedToken";
import ParensOpenToken from "./TokenModel/ParensOpenToken";
import ParensCloseToken from "./TokenModel/ParensCloseToken";

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
      const taggedToken: TaggedToken = new TaggedToken(
        "(",
        new ParensOpenToken()
      );
      context.taggedPredicates.push(
        new TokenMap([taggedToken], PredicateType.parensOpen)
      );
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
      const taggedToken: TaggedToken = new TaggedToken(
        ")",
        new ParensCloseToken()
      );
      context.taggedPredicates.push(
        new TokenMap([taggedToken], PredicateType.parensClose)
      );
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

  /**
   * checks if the token matches what should be a value
   * Does not validate that the value is using correct
   * Syntax!
   *
   * @param {string} token
   * @return {*}  {boolean}
   * @memberof QPState
   */
  isValue(token: string): boolean {
    const match = token.match(
      /^true$|^false$|^-?\d+|^guid'|^'|^"|^X'|^binary'/
    );
    if (match !== null && match!.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Checks is value matches correct Guid syntax
   *
   * @param {string} token
   * @return {boolean}
   * @memberof QPState
   */
  isGuidValue(token: string): boolean {
    const match = token.match(
      /^guid'[A-Z0-9]{8}-([A-Z0-9]{4}-){3}[A-Z0-9]{12}'/gim
    );
    if (match !== null && match!.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Checks if token matches binary syntax
   *
   * @param {string} token
   * @return {*}  {boolean}
   * @memberof QPState
   */
  isBinaryValue(token: string): boolean {
    const match = token.match(/^X'|^binary'/);
    if (match !== null && match!.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Checks if token matches Long value syntax
   *
   * @param {string} token
   * @return {*}  {boolean}
   * @memberof QPState
   */
  isLongValue(token: string): boolean {
    const match = token.match(/^-?\d+\.?\d*L$/);
    if (match !== null && match!.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Checks if token matches integer value syntax
   *
   * @param {string} token
   * @return {*}  {boolean}
   * @memberof QPState
   */
  isIntegerValue(token: string): boolean {
    const match = token.match(/^-?\d+$/);
    if (match !== null && match!.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Checks if token matches string value syntax
   *
   * @param {string} token
   * @return {*}  {boolean}
   * @memberof QPState
   */
  isStringValue(token: string): boolean {
    const match = token.match(/^\'.*\'$|^\".*\"$/);
    if (match !== null && match!.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Checks if token matches Long value syntax
   *
   * @param {string} token
   * @return {*}  {boolean}
   * @memberof QPState
   */
  isDoubleValue(token: string): boolean {
    const match = token.match(/^-?\d+\.+\d+$/);
    if (match !== null && match!.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Checks if token matches datetime value syntax
   *
   * @param {string} token
   * @return {*}  {boolean}
   * @memberof QPState
   */
  isDateValue(token: string): boolean {
    const match = token.match(/^datetime'/);
    if (match !== null && match!.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Checks if token matches boolean value syntax
   *
   * @param {string} token
   * @return {*}  {boolean}
   * @memberof QPState
   */
  isBooleanValue(token: string): boolean {
    const match = token.match(/^true$|^false$/);
    if (match !== null && match!.length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Checks if token is an identifier
   *
   * @param {string} token
   * @return {*}  {boolean}
   * @memberof QPState
   */
  isIdentifier(token: string): boolean {
    const match = token.match(
      /^(?!true$)(?!false$)(?!guid')(?!binary')(?!X')(?!datetime')[a-zA-Z]/
    );
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

  protected updateTaggedTokens(
    context: QueryContext,
    taggedToken: TaggedToken
  ) {
    let taggedTokens: TaggedToken[] = [];
    if (context.taggedPredicates.length === context.currentPredicate + 1) {
      taggedTokens = context.taggedPredicates[context.currentPredicate].tokens;
    }
    taggedTokens.push(taggedToken);
    return taggedTokens;
  }

  /**
   * Updates tagged predicate, will set to unknown
   * PredicateType should be set correctly in the checking functions
   *
   * @protected
   * @param {TaggedToken[]} taggedTokens
   * @param {QueryContext} context
   * @return {*}  {QueryContext}
   * @memberof QPState
   */
  protected updateTaggedPredicate(
    taggedTokens: TaggedToken[],
    context: QueryContext
  ): QueryContext {
    const tokenMap: TokenMap = new TokenMap(
      taggedTokens,
      PredicateType.unknown
    );
    context.taggedPredicates[context.currentPredicate] = tokenMap;
    return context;
  }
}
