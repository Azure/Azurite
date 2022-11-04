import IPredicate from "./PredicateModel/IPredicate";
import { QueryStateName } from "./QueryStateName";

/**
 * This object contains the state of the query
 * as it undergoes transcription processing
 *
 * @export
 * @class QueryContext
 */
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
  public isTableQuery: boolean = false;
  constructor(queryString: string, isTableQuery: boolean = false) {
    this.originalQuery = queryString;
    this.isTableQuery = isTableQuery;
  }
}
