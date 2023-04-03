import IQPState from "./IQPState";
import { TokenMap } from "./PredicateModel/TokenMap";
import UnknownPredicate from "./PredicateModel/UnknownPredicate";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import TaggedToken from "./TokenModel/TaggedToken";
import ValueToken from "./TokenModel/ValueToken";

/**
 * contains the logic for processing values
 *
 * @export
 * @class StateProcessValue
 * @extends {QPState}
 * @implements {IQPState}
 */
export default class StateProcessValue extends QPState implements IQPState {
  name = QueryStateName.ProcessValue;

  /**
   * processes the current token which is a value
   *
   * @param {QueryContext} context
   * @memberof StateProcessValue
   */
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.getNextToken(context);

    context = this.storeTaggedTokens(context, token);

    [context, token] = this.getNextToken(context);
    context = this.handleToken(context, token);

    return context;
  };

  /**
   * Determines the next token.
   * Overriden for the case of value processing
   * due to strings containing whitespace
   * @param context
   * @returns
   */
  protected override getNextToken(
    context: QueryContext
  ): [QueryContext, string] {
    let tokenStart: number;
    [context, tokenStart] = this.startofNextRelevantToken(context);
    const tokenEnd = this.handleStringValue(context, tokenStart);
    return this.validateToken(context, tokenStart, tokenEnd);
  }

  /**
   * extract a string value
   *
   * @private
   * @param {QueryContext} context
   * @param {number} tokenStart
   * @return {*}
   * @memberof StateProcessValue
   */
  private handleStringValue(context: QueryContext, tokenStart: number) {
    // need to account for apostrophe escaping
    // http://docs.oasis-open.org/odata/odata/v4.0/errata03/os/complete/part2-url-conventions/odata-v4.0-errata03-os-part2-url-conventions-complete.html#ABNF
    // OData the ABNF rules explicitly state whether the percent-encoded representation is treated identical to the plain literal representation.
    // This is done to make the input strings in the ABNF test cases more readable.
    // One of these rules is that single quotes within string literals are represented as two consecutive single quotes.
    // Example 3: valid OData URLs:
    // http://host/service/People('O''Neil')
    // http://host/service/People(%27O%27%27Neil%27)
    // http://host/service/People%28%27O%27%27Neil%27%29
    // http://host/service/Categories('Smartphone%2FTablet')
    if (context.originalQuery[tokenStart] === "'") {
      // if we have a string, we need to check for double appostrophe each time we find a valid end
      let posApostrophe = context.originalQuery.indexOf("'", tokenStart + 1);

      // Why minus 2 : becuase there must be enough room for 3 apostrophe otherwise
      // the syntax would be invalid.
      while (posApostrophe < context.originalQuery.length - 2) {
        const nextChar = context.originalQuery.charAt(posApostrophe + 1);
        if (nextChar === "'") {
          // double apostrophe used as litteral '
          posApostrophe += 1;
        } else {
          break;
        }
        posApostrophe = context.originalQuery.indexOf("'", posApostrophe + 1);
      }

      return posApostrophe + 1;
    }
    return this.endOfToken(context, tokenStart);
  }

  /**
   * state transition logic
   *
   * @protected
   * @param {QueryContext} context
   * @param {string} token
   * @return {*}  {QueryContext}
   * @memberof StateProcessValue
   */
  protected handleToken(context: QueryContext, token: string): QueryContext {
    // categorize the token
    if (token === "") {
      context.stateQueue.push(QueryStateName.PredicateFinished);
    } else if (token === "(") {
      context.stateQueue.push(QueryStateName.PredicateStarted);
    } else if (token === ")") {
      context.stateQueue.push(QueryStateName.PredicateFinished);
    } else if (this.isPredicateOperator(token)) {
      if (this.name === QueryStateName.PredicateFinished) {
        context.stateQueue.push(QueryStateName.ProcessPredicateOperator);
      } else {
        context.stateQueue.push(QueryStateName.PredicateFinished);
      }
      // will need to end current predicate and create a new predicate
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
   * optional post processing, here we can add logging
   * or additional validation etc
   *
   * @param {QueryContext} context
   * @memberof StateProcessValue
   */
  onExit = (context: QueryContext) => {
    return context;
  };

  /**
   * stores the token as value
   *
   * @private
   * @param {QueryContext} context
   * @param {string} token
   * @return {*}  {QueryContext}
   * @memberof StateProcessValue
   */
  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    context = this.startNewPredicate(context);

    const taggedToken: TaggedToken = new TaggedToken(token, new ValueToken());

    const taggedTokens = this.updateTaggedTokens(context, taggedToken);
    context = this.updateTaggedPredicate(taggedTokens, context);

    context.currentPos += token.length;

    return context;
  }

  /**
   * determines if we need to start a new predicate
   *
   * @param {QueryContext} context
   * @return {*}  {QueryContext}
   * @memberof StateProcessValue
   */
  startNewPredicate(context: QueryContext): QueryContext {
    if (
      context.taggedPredicates[context.currentPredicate] !== undefined &&
      context.taggedPredicates[context.currentPredicate].tokenMap.tokens
        .length !== 0 &&
      (context.taggedPredicates[
        context.currentPredicate
      ].tokenMap.tokens[0].type.isParensOpen() ||
        context.taggedPredicates[
          context.currentPredicate
        ].tokenMap.tokens[0].type.isParensClose() ||
        context.taggedPredicates[
          context.currentPredicate
        ].tokenMap.tokens[0].type.isOperator())
    ) {
      context.taggedPredicates.push(new UnknownPredicate(new TokenMap([])));
      context.currentPredicate += 1;
    }
    return context;
  }
}
