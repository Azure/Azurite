import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StateQueryStarted extends QPState implements IQPState {
  name = QueryStateName.QueryStarted;
  /**
   * start the processing and state machine
   *
   * @memberof StateQueryStarted
   */
  onProcess = (context: QueryContext) => {
    // todo: validate performance of estimating size of query array
    // here, or just extending array size as needed?

    let token = "";
    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

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
}
