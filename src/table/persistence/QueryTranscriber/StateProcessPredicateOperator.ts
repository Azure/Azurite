import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import TaggedToken from "./TokenModel/TaggedToken";
import OperatorToken from "./TokenModel/OperatorToken";
import UnknownPredicate from "./PredicateModel/UnknownPredicate";
import { TokenMap } from "./PredicateModel/TokenMap";
import PredicateOperator from "./PredicateModel/PredicateOperator";

export default class StateProcessPredicateOperator
  extends QPState
  implements IQPState
{
  name = QueryStateName.ProcessOperator;

  /**
   * process current query token which is operator
   *
   * @param {QueryContext} context
   * @memberof StateProcessOperator
   */
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.getNextToken(context);
    const originalTokenLength = token.length;
    token = this.convertOperatorToken(token);
    context = this.storeTaggedTokens(context, token, originalTokenLength);

    [context, token] = this.getNextToken(context);
    context = this.handleToken(context, token);
    return context;
  };

  protected handleToken(context: QueryContext, token: string): QueryContext {
    // with a predicate operator we always finish the last predicate and start another

    context.stateQueue.push(QueryStateName.PredicateFinished);

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
   * Converts a token from query request to a type used in persistence
   * layer query function.
   *
   * @private
   * @static
   * @param {string} token
   * @return {*}  {string}
   * @memberof LokiTableMetadataStore
   */
  private convertOperatorToken(token: string): string {
    switch (token) {
      case "and":
        return "&&";
      case "or":
        return "||";
      case "not":
        return "!";
      default:
        return token;
    }
  }

  /**
   * Stores the tokens
   *
   * @private
   * @param {QueryContext} context
   * @param {string} token
   * @param {number} originalTokenLength
   * @return {*}  {QueryContext}
   * @memberof StateProcessPredicateOperator
   */
  private storeTaggedTokens(
    context: QueryContext,
    token: string,
    originalTokenLength: number
  ): QueryContext {
    // predicate operator should be stored singly

    const taggedToken: TaggedToken = new TaggedToken(
      token,
      new OperatorToken()
    );

    context.taggedPredicates.push(
      new PredicateOperator(new TokenMap([taggedToken]))
    );
    context.currentPredicate += 1;

    context.currentPos += originalTokenLength;

    return context;
  }

  /**
   * Starts a new predicate in case we are working without parens
   *
   * @param {QueryContext} context
   * @return {*}  {QueryContext}
   * @memberof StateProcessPredicateOperator
   */
  incrementPredicateWithoutParens(context: QueryContext): QueryContext {
    if (
      context.taggedPredicates[this.getCorrectPredicate(context)].tokenMap
        .tokens.length === 3
    ) {
      context.currentPredicate += 1;
      context.taggedPredicates.push(new UnknownPredicate(new TokenMap([])));
      return context;
    }
    this.checkNumberOfTokens(context);
    return context;
  }

  /**
   * Get's the correct predic ate number, depending on if we have parens or not
   *
   * @param {QueryContext} context
   * @return {*}
   * @memberof StateProcessPredicateOperator
   */
  getCorrectPredicate(context: QueryContext) {
    if (context.taggedPredicates[context.currentPredicate] === undefined) {
      return context.currentPredicate - 1; // why is this 2?
    } else {
      return context.currentPredicate;
    }
  }

  /**
   * Ensures that predicate is valid based on number of tokens
   *
   * @param {QueryContext} context
   * @memberof StateProcessPredicateOperator
   */
  checkNumberOfTokens(context: QueryContext) {
    if (
      context.taggedPredicates[this.getCorrectPredicate(context)].tokenMap
        .tokens.length !== 1
    ) {
      throw new Error("Invalid number of tokens in predicate.");
    }
  }
}
