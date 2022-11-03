import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import TaggedToken from "./TokenModel/TaggedToken";
import { TokenMap } from "./PredicateModel/TokenMap";
import ParensCloseToken from "./TokenModel/ParensCloseToken";
import ParensClose from "./PredicateModel/ParensClose";

/**
 * contains the logic to handle parens close
 *
 * @export
 * @class StateProcessParensClose
 * @extends {QPState}
 * @implements {IQPState}
 */
export default class StateProcessParensClose
  extends QPState
  implements IQPState
{
  name = QueryStateName.ProcessParensClose;

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

  /**
   * state transition logic
   *
   * @protected
   * @param {QueryContext} context
   * @param {string} token
   * @return {*}  {QueryContext}
   * @memberof StateProcessParensClose
   */
  protected handleToken(context: QueryContext, token: string): QueryContext {
    // Parens Close will always end the predicate
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
   * Stores the tokens
   *
   * @private
   * @param {QueryContext} context
   * @param {string} token
   * @param {number} originalTokenLength
   * @return {*}  {QueryContext}
   * @memberof StateProcessParensClose
   */
  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    const taggedParensToken: TaggedToken = new TaggedToken(
      token,
      new ParensCloseToken()
    );
    const parensTokenMap: TokenMap = new TokenMap([taggedParensToken]);
    context.taggedPredicates.push(new ParensClose(parensTokenMap));
    context.currentPredicate += 1;
    context.currentPos += token.length;
    return context;
  }
}
