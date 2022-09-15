import { QueryStateName } from "./QueryStateName";
import { TokenMap } from "./TokenMap";

export default class QueryContext {
  public currentPos: number = 0;
  public hadIdentifier: boolean = false;
  public hadValue: boolean = false;
  public hadOperator: boolean = false;
  public originalQuery: string = "";
  public taggedPredicates: TokenMap[] = [];
  public transcribedQuery: string = "";
  public stateQueue: QueryStateName[] = [];
  constructor(queryString: string) {
    this.originalQuery = queryString;
  }
}
