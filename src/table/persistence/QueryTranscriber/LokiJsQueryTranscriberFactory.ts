import LokiJsQueryTranscriber from "./LokiJsQueryTranscriber";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import StatePredicateFinished from "./StatePredicateFinished";
import StatePredicateStarted from "./StatePredicateStarted";
import StateQueryFinished from "./StateQueryFinished";
import StateQueryStarted from "./StateQueryStarted";

export default class LokiJsQueryTranscriberFactory {
  public static createQueryTranscriber(
    queryString: string,
    name: string = "default"
  ): LokiJsQueryTranscriber {
    // initializes the data state for the query transcriber state machine
    const queryContext = new QueryContext(queryString);
    const transcriber = new LokiJsQueryTranscriber(queryContext, name);

    // Add the states to the transcriber.
    transcriber.addState(QueryStateName.QueryStarted, new StateQueryStarted());
    transcriber.addState(
      QueryStateName.PredicateStarted,
      new StatePredicateStarted()
    );
    transcriber.addState(
      QueryStateName.PredicateFinished,
      new StatePredicateFinished()
    );
    transcriber.addState(
      QueryStateName.QueryFinished,
      new StateQueryFinished()
    );

    return transcriber;
  }
}
