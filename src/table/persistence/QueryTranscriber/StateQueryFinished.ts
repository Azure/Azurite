import IQPState from "./IQPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

/**
 * state to complete the transcribing of a query
 *
 * @export
 * @class StateQueryFinished
 * @implements {IQPState}
 */
export default class StateQueryFinished implements IQPState {
  name = QueryStateName.QueryFinished;

  /**
   * completes query transcribing
   *
   * @memberof StateQueryFinished
   */
  onProcess = (context: QueryContext) => {
    // first setup the query output function
    context.transcribedQuery = "return (";
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

  /**
   * optional post processing, here we can add logging
   * or additional validation etc
   *
   * @param {QueryContext} context
   * @memberof StateProcessValue
   */
  onExit = (context: QueryContext) => {
    // ToDo: Log converted query?
    return context;
  };
}
