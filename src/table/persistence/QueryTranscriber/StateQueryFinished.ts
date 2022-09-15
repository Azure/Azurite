import IQPState from "./IQPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StateQueryFinished implements IQPState {
  name = QueryStateName.QueryFinished;
  onEnter = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("query finished enter");

    // add tagged predicates to the query output, then close the query function
    for (const taggedPredicate of context.taggedPredicates) {
      let predicate = "";
      for (const taggedPredicateToken of taggedPredicate[0]) {
        predicate += " ";
        predicate += taggedPredicateToken[0];
      }

      context.transcribedQuery += predicate;
    }

    return context;
  };
  onUpdate = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("query finished update");
    return context;
  };
  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("query finished exit");
    return context;
  };
}
