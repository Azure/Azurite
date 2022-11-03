import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import QueryTranscriber from "./QueryTranscriber";

/**
 * provides a facade over the QueryTranscriber to hide state
 * implementation from callers
 *
 * @export
 * @class LokiJsQueryTranscriber
 * @extends {QueryTranscriber}
 */
export default class LokiJsQueryTranscriber extends QueryTranscriber {
  constructor(queryContext: QueryContext, name: string) {
    super(queryContext, name);
  }

  /**
   * Starts the statemachine without the need to know what states were used
   *
   * @memberof LokiJsQueryTranscriber
   */
  public start() {
    this.setState(QueryStateName.QueryStarted);
  }
}
