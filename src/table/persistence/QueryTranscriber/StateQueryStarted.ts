import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StateQueryStarted extends QPState implements IQPState {
  name = QueryStateName.QueryStarted;
  onEnter = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("query started enter");
    // first setup the query output function
    // todo: validate performance of estimating size of query array
    // here, or just extending array size as needed

    context.transcribedQuery = "return ( ";

    context.stateQueue.push(QueryStateName.PredicateStarted);

    return context;
  };

  onUpdate = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("query started update");
    return context;
  };

  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("query started exit");
    return context;
  };
}
