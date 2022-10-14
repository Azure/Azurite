import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import { PredicateType } from "./PredicateType";
import { TokenMap } from "./TokenMap";
import { TokenType } from "./TokenType";
import TaggedToken from "./TaggedToken";

export default class StatePredicateStarted extends QPState implements IQPState {
  name = QueryStateName.PredicateStarted;

  // Starts the processing of a predicate clause
  // these ar the units in which we need to maintain
  // backwards schema compatibility
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.determineNextToken(context);

    context = this.storeTaggedTokens(context, token);

    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

    // Checks if predicate ends... option for error handling
    // or earlier query logic validation
    // (this should always be the case in proper processing)
    if (context.currentPos === context.transcribedQuery.length - 1) {
      context.stateQueue.push(QueryStateName.PredicateFinished);
    }

    return context;
  };

  // perform any post porcessing on state
  onExit = (context: QueryContext) => {
    return context;
  };

  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    // parens are stored in their own entry
    context.currentPredicate += 1;
    const taggedToken: TaggedToken = new TaggedToken(
      token,
      TokenType.ParensOpen
    );
    const tokenMap: TokenMap = new TokenMap(
      [taggedToken],
      PredicateType.parensOpen
    );
    context.taggedPredicates[context.currentPredicate] = tokenMap;
    context.currentPos += token.length;
    context.currentPredicate += 1;

    return context;
  }
}
