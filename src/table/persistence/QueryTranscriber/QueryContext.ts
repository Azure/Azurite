import IPredicate from "./PredicateModel/IPredicate";
import { QueryStateName } from "./QueryStateName";

export default class QueryContext {
  public currentPos: number = 0;
  // the original query string passed into the transcriber
  public originalQuery: string = "";
  // a collection of predicates which are used in the query function
  public taggedPredicates: IPredicate[] = [];
  // represents the current predicate that is being processed
  public currentPredicate: number = 0;
  public transcribedQuery: string = "";
  public stateQueue: QueryStateName[] = [];
  constructor(queryString: string) {
    this.originalQuery = queryString;
  }
}
