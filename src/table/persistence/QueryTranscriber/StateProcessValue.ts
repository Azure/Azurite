import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StateProcessOperator extends QPState implements IQPState {
  name = QueryStateName.ProcessValue;
  onProcess = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("Processing Value");

    let token = "";
    [context, token] = this.determineNextToken(context);

    context.transcribedQuery += ` ${token}`;
    context.currentPos += token.length;

    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

    return context;
  };

  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("Processing Value exit");

    // decide on next state
    // simple case first with identifier, operator, value
    // context.stateQueue.push(QueryStateName.PredicateFinished);
    // Should check the predicate structure here?
    // or on the parens case?
    return context;
  };
}
