import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import TaggedToken from "./TokenModel/TaggedToken";
import IdentifierToken from "./TokenModel/IdentifierToken";
import UnknownPredicate from "./PredicateModel/UnknownPredicate";
import { TokenMap } from "./PredicateModel/TokenMap";

/**
 * contains the logic to handle an identifier
 *
 * @export
 * @class StateProcessIdentifier
 * @extends {QPState}
 * @implements {IQPState}
 */
export default class StateProcessIdentifier
  extends QPState
  implements IQPState
{
  name = QueryStateName.ProcessIdentifier;

  /**
   * process current token which is an identifier
   *
   * @param {QueryContext} context
   * @memberof StateProcessIdentifier
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
   * @memberof StateProcessIdentifier
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
   * stores the token as an identifier
   *
   * @private
   * @param {QueryContext} context
   * @param {string} token
   * @return {*}  {QueryContext}
   * @memberof StateProcessIdentifier
   */
  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    token = this.updateTableIdentifier(context, token);

    const taggedToken: TaggedToken = new TaggedToken(
      token,
      new IdentifierToken()
    );

    context = this.startNewPredicate(context);

    const taggedTokens = this.updateTaggedTokens(context, taggedToken);
    context = this.updateTaggedPredicate(taggedTokens, context);

    context.currentPos += token.length;

    return context;
  }

  private updateTableIdentifier(context: QueryContext, token: string) {
    if (context.isTableQuery && token.toLowerCase() === "tablename") {
      token = "**blena**";
    }
    return token;
  }

  /**
   * This determines if we need to start a new predicate clause
   *
   * @private
   * @param {QueryContext} context
   * @return {*}  {QueryContext}
   * @memberof StateProcessIdentifier
   */
  private startNewPredicate(context: QueryContext): QueryContext {
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
