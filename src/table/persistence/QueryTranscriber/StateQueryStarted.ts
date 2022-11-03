import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

/**
 * This is the first state of the query processing
 *
 * @export
 * @class StateQueryStarted
 * @extends {QPState}
 * @implements {IQPState}
 */
export default class StateQueryStarted extends QPState implements IQPState {
  name = QueryStateName.QueryStarted;
  /**
   * start the processing and state machine
   *
   * @memberof StateQueryStarted
   */
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.getNextToken(context);
    context = this.handleToken(context, token);

    return context;
  };

  /**
   * State transition logic
   *
   * @protected
   * @param {QueryContext} context
   * @param {string} token
   * @return {*}  {QueryContext}
   * @memberof StateQueryStarted
   */
  protected handleToken(context: QueryContext, token: string): QueryContext {
    // categorize the token
    if (token === "") {
      context.stateQueue.push(QueryStateName.QueryFinished);
    } else if (token === "(") {
      context.stateQueue.push(QueryStateName.PredicateStarted);
    } else if (token === ")") {
      throw new Error("Invalid Query, starting with parens close!");
    } else if (this.isPredicateOperator(token)) {
      context.stateQueue.push(QueryStateName.PredicateStarted);
    } else if (this.isOperand(token)) {
      // match operand (specific set)
      throw new Error("Invalid Query, starting with operand!");
    } else if (this.isValue(token)) {
      // match number (long & doubles? needed)
      // match string (starts with ', or " ?)
      // match guid (is exactly guid'<guidval>')
      context.stateQueue.push(QueryStateName.PredicateStarted);
    } else if (this.isIdentifier(token)) {
      // match identifier (can only start with letter)
      context.stateQueue.push(QueryStateName.PredicateStarted);
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
}
