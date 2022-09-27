import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StatePredicateStarted extends QPState implements IQPState {
  name = QueryStateName.PredicateStarted;
  onProcess = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate started processing");

    // now process next tokens
    let nextToken = "";
    [context, nextToken] = this.determineNextToken(context);

    context = this.handleToken(context, nextToken);

    // handle token
    // change state to handle tokens?
    // we check the curent predicate to validate if state change was valid
    // when invalid, throw Error
    // or choose next state

    // set next state
    context.stateQueue.push(QueryStateName.PredicateFinished);

    return context;
  };

  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate started exit");
    return context;
  };
}
