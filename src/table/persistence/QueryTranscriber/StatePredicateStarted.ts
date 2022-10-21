import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import { TokenMap } from "./PredicateModel/TokenMap";
import TaggedToken from "./TokenModel/TaggedToken";
import ParensOpenToken from "./TokenModel/ParensOpenToken";
import ParensOpen from "./PredicateModel/ParensOpen";

export default class StatePredicateStarted extends QPState implements IQPState {
  name = QueryStateName.PredicateStarted;

  /**
   * Starts the processing of a predicate clause
   * these ar the units in which we need to maintain
   * backwards schema compatibility
   *
   * @param {QueryContext} context
   * @memberof StatePredicateStarted
   */
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.determineNextToken(context);

    context = this.storeTaggedTokens(context, token);

    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

    // Checks if predicate ends... option for error handling
    // or earlier query logic validation
    // (this should always be the case in proper processing)
    if (context.currentPos === context.transcribedQuery.length - 1) {
      context.stateQueue.push(QueryStateName.PredicateFinished);
    }

    return context;
  };

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
   * stores the tagged tokens
   *
   * @private
   * @param {QueryContext} context
   * @param {string} token
   * @return {*}  {QueryContext}
   * @memberof StatePredicateStarted
   */
  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    // parens are stored in their own entry
    context.currentPredicate += 1;
    const taggedToken: TaggedToken = new TaggedToken(
      token,
      new ParensOpenToken()
    );
    const tokenMap: TokenMap = new TokenMap([taggedToken]);
    context.taggedPredicates[context.currentPredicate] = new ParensOpen(
      tokenMap
    );
    context.currentPos += token.length;
    context.currentPredicate += 1;

    return context;
  }
}
