import IQPState from "./IQPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StatePredicateFinished implements IQPState {
  name = QueryStateName.PredicateFinished;
  onProcess = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate finished processing");

    // set next state
    // need a choosing function
    // either new predicate, or query finished
    context.stateQueue.push(QueryStateName.QueryFinished);
    return context;
  };

  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate finished exit");

    // validate current predicate?
    return context;
  };
}
