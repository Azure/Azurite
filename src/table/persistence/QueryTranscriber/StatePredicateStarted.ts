import IQPState from "./IQPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StatePredicateStarted implements IQPState {
  name = QueryStateName.PredicateStarted;
  onEnter = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate started enter");
    return context;
  };
  onUpdate = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate started update");
    return context;
  };
  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate started exit");
    return context;
  };
}
