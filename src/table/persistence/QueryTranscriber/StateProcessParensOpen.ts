import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import TaggedToken from "./TokenModel/TaggedToken";
import { TokenMap } from "./PredicateModel/TokenMap";
import ParensOpenToken from "./TokenModel/ParensOpenToken";
import ParensOpen from "./PredicateModel/ParensOpen";

export default class StateProcessParensOpen
  extends QPState
  implements IQPState
{
  name = QueryStateName.ProcessParensOpen;

  /**
   * process current query token which is operator
   *
   * @param {QueryContext} context
   * @memberof StateProcessOperator
   */
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.getNextToken(context);

    context = this.storeTaggedTokens(context, token);

    [context, token] = this.getNextToken(context);
    context = this.handleToken(context, token);
    return context;
  };

  protected handleToken(context: QueryContext, token: string): QueryContext {
    // Parens Open will always start a predicate
    context.stateQueue.push(QueryStateName.PredicateStarted);

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
   * Stores the tokens
   *
   * @private
   * @param {QueryContext} context
   * @param {string} token
   * @return {*}  {QueryContext}
   * @memberof StateProcessParensOpen
   */
  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    // predicate operator should be stored singly

    const taggedToken: TaggedToken = new TaggedToken(
      token,
      new ParensOpenToken()
    );

    context.taggedPredicates.push(new ParensOpen(new TokenMap([taggedToken])));
    context.currentPredicate += 1;

    context.currentPos += 1; // increment for parens

    return context;
  }
}
