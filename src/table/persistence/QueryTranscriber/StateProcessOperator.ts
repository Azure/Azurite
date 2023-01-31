import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import TaggedToken from "./TokenModel/TaggedToken";
import OperatorToken from "./TokenModel/OperatorToken";

/**
 * contains logic to handle operators
 *
 * @export
 * @class StateProcessOperator
 * @extends {QPState}
 * @implements {IQPState}
 */
export default class StateProcessOperator extends QPState implements IQPState {
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

  /**
   * state transition logic
   *
   * @protected
   * @param {QueryContext} context
   * @param {string} token
   * @return {*}  {QueryContext}
   * @memberof StateProcessOperator
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
      case "eq":
        return "===";
      case "gt":
        return ">";
      case "ge":
        return ">=";
      case "lt":
        return "<";
      case "le":
        return "<=";
      case "ne":
        return "!==";
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
   * stores and tags the token as an operator
   *
   * @private
   * @param {QueryContext} context
   * @param {string} token
   * @param {number} originalTokenLength
   * @return {*}  {QueryContext}
   * @memberof StateProcessOperator
   */
  private storeTaggedTokens(
    context: QueryContext,
    token: string,
    originalTokenLength: number
  ): QueryContext {
    const taggedToken: TaggedToken = new TaggedToken(
      token,
      new OperatorToken()
    );

    const taggedTokens = this.updateTaggedTokens(context, taggedToken);
    context = this.updateTaggedPredicate(taggedTokens, context);

    context.currentPos += originalTokenLength;

    return context;
  }
}
