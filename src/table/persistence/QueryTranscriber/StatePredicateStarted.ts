import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StatePredicateStarted extends QPState implements IQPState {
  name = QueryStateName.PredicateStarted;
  onProcess = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate started processing");

    // now process next tokens
    let token = "";
    [context, token] = this.determineNextToken(context);
    // tslint:disable-next-line: no-console
    console.log(token);
    // ***
    // Determine next step

    context.transcribedQuery += ` ${token}`;
    context.currentPos += token.length;

    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

    // Check if predicate ends...
    // (this should always be the case in proper processing)
    if (context.currentPos === context.transcribedQuery.length - 1) {
      context.stateQueue.push(QueryStateName.PredicateFinished);
    }

    return context;
  };

  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("predicate started exit");
    return context;
  };
}
