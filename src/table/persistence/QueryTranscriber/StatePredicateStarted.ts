import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

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
   * @memberof StatePredicateStarted
   */
  protected handleToken(context: QueryContext, token: string): QueryContext {
    // categorize the token
    if (token === "") {
      context.stateQueue.push(QueryStateName.PredicateFinished);
    } else if (token === "(") {
      context.stateQueue.push(QueryStateName.ProcessParensOpen);
    } else if (token === ")") {
      context.stateQueue.push(QueryStateName.ProcessParensClose);
    } else if (this.isPredicateOperator(token)) {
      this.presdicateStartingOperator(context);
    } else if (this.isOperand(token)) {
      // match operand (specific set)
      throw new Error(
        "Invalid Query, cannot start predicate with operator! " + token
      );
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
   * There are 2 cases that will get us here:
   * 1. a filter without parens
   * - we will have processed a predicate
   * - we should finish the predicate
   * 2. a not operator on it's own
   * - we will not have processed a value or identifier
   * - we must process the operator
   * - will need to end current predicate and create a new predicate
   *
   * @private
   * @param {QueryContext} context
   * @memberof StatePredicateStarted
   */
  private presdicateStartingOperator(context: QueryContext) {
    if (
      context.currentPos === 0 ||
      context.taggedPredicates[context.currentPredicate].tokenMap.tokens ===
        undefined ||
      context.taggedPredicates[context.currentPredicate].tokenMap.tokens
        .length === 0
    ) {
      context.stateQueue.push(QueryStateName.ProcessOperator);
    } else {
      context.stateQueue.push(QueryStateName.PredicateFinished);
    }
  }
}
