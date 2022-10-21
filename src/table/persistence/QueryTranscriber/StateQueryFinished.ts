import IQPState from "./IQPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StateQueryFinished implements IQPState {
  name = QueryStateName.QueryFinished;

  /**
   * completes query transcribing
   *
   * @memberof StateQueryFinished
   */
  onProcess = (context: QueryContext) => {
    // add tagged predicates to the query output, then close the query function
    // this is where we add support for backwards compatability in the schema
    // and do conversions for special types etc and their DB schema representation
    for (const taggedPredicate of context.taggedPredicates) {
      let predicate = "";
      if (taggedPredicate !== undefined) {
        const convertedPredicate = taggedPredicate.convertPredicateForLokiJS();
        for (const taggedPredicateToken of convertedPredicate.tokenMap.tokens) {
          predicate += " ";
          predicate += taggedPredicateToken.token;
        }
      }

      context.transcribedQuery += predicate;
    }
    // Close off query function:
    context.transcribedQuery += " )";
    return context;
  };

  onExit = (context: QueryContext) => {
    // ToDo: Log converted query?
    return context;
  };
}
