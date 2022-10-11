import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StateQueryStarted extends QPState implements IQPState {
  name = QueryStateName.QueryStarted;
  onProcess = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("query started processing");
    // first setup the query output function
    // todo: validate performance of estimating size of query array
    // here, or just extending array size as needed

    context.transcribedQuery = "return (";
    // let token = "";

    // [context, token] = this.determineNextToken(context);

    // ***
    // Determine next step
    // thinking that defaulting to a predicate is a good idea
    // Will leave tokenization to the predicate processing State
    // tslint:disable-next-line: no-console
    // console.log(token);

    // option: force predicate processing
    // context.stateQueue.push(QueryStateName.PredicateStarted);

    // vs deciding? (this will decide if we need a stack or queue)

    let token = "";
    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

    // *** end determine next step
    return context;
  };

  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("query started exit");
    return context;
  };
}
