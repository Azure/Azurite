import IQPState from "./IQPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StateQueryFinished implements IQPState {
  name = QueryStateName.QueryFinished;

  // completes query transcribing
  onProcess = (context: QueryContext) => {
    // add tagged predicates to the query output, then close the query function
    // this is where we add support for backwards compatability in the schema
    for (const taggedPredicate of context.taggedPredicates) {
      let predicate = "";
      if (taggedPredicate !== undefined) {
        for (const taggedPredicateToken of taggedPredicate[0]) {
          predicate += " ";
          predicate += taggedPredicateToken[0];
        }
      }

      context.transcribedQuery += predicate;
    }
    // Close off query function:
    context.transcribedQuery += " )";
    return context;
  };

  onExit = (context: QueryContext) => {
    // Log converted query?
    return context;
  };
}
