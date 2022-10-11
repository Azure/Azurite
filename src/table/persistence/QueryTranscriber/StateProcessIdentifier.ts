import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StateProcessIdentifier
  extends QPState
  implements IQPState
{
  name = QueryStateName.ProcessIdentifier;
  onProcess = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("Processing Identifier");

    let token = "";
    [context, token] = this.determineNextToken(context);

    context.transcribedQuery += ` ${token}`;
    context.currentPos += token.length;

    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

    return context;
  };

  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("Processing Identifier exit");

    // decide on next state
    // simple case fiorst with identifier, operator, value
    // context.stateQueue.push(QueryStateName.ProcessOperator);
    return context;
  };
}
