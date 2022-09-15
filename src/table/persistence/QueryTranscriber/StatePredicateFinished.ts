import IQPState from "./IQPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StatePredicateFinished implements IQPState {
  name = QueryStateName.PredicateFinished;
  onEnter = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate finished enter");
    return context;
  };
  onUpdate = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate finished update");
    return context;
  };
  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate finished exit");
    return context;
  };
}
