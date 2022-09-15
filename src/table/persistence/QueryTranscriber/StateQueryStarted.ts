import IQPState from "./IQPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import { QueryType } from "./QueryType";
import { TaggedToken, TokenType } from "./TokenMap";

export default class StateQueryStarted implements IQPState {
  name = QueryStateName.QueryStarted;
  onEnter = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("query started enter");
    // first setup the query output function
    // todo: validate performance of estimating size of query array
    // here, or just extending array size as needed
    context.transcribedQuery = "return ( ";

    // check for parenthesis
    context = this.processOpeningParens(context);

    // decide on the next step
    let nextRelevantToken = "";
    [context, nextRelevantToken] = this.nextRelevantToken(context);

    // process the next relevant token
    if (
      nextRelevantToken === ")" &&
      context.currentPos === context.originalQuery.length
    ) {
      context.stateQueue.push(QueryStateName.QueryFinished);
    }
    // ToDo: is it better to bind the action functions?

    return context;
  };

  onUpdate = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("query started update");
    return context;
  };

  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("query started exit");
    return context;
  };

  private nextRelevantToken(context: QueryContext): [QueryContext, string] {
    let token = "";
    let relevantTokenFound = false;
    while (relevantTokenFound === false) {
      token = context.originalQuery[context.currentPos];
      switch (token) {
        case " ":
          break;
        case ")":
          relevantTokenFound = true;
          break;
        default:
          relevantTokenFound = true;
          break;
      }
      context.currentPos += 1;
    }
    return [context, token];
  }

  private processOpeningParens(context: QueryContext): QueryContext {
    if (context.originalQuery.match(/^\(/)) {
      const taggedToken: TaggedToken = ["(", TokenType.ParensOpen];
      context.taggedPredicates.push([[taggedToken], QueryType.parensOpen]);
      context.currentPos += 1;
    }
    return context;
  }
}
