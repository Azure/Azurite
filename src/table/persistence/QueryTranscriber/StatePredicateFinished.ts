import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import { PredicateType } from "./PredicateType";
import { TaggedToken, TokenMap, TokenType } from "./TokenMap";

export default class StatePredicateFinished
  extends QPState
  implements IQPState
{
  name = QueryStateName.PredicateFinished;

  // when finishing a predicate, we need to update the query type
  onProcess = (context: QueryContext) => {
    let token = "";

    context = this.validatePredicate(context);

    [context, token] = this.determineNextToken(context);

    context = this.storeTaggedTokens(context, token);

    if (context.currentPos === context.originalQuery.length) {
      context.stateQueue.push(QueryStateName.QueryFinished);
    } else {
      [context, token] = this.determineNextToken(context);
      context = this.handleToken(context, token);
    }

    return context;
  };

  validatePredicate(context: QueryContext): QueryContext {
    this.checkPredicateLength(context);
    this.checkSingleTerm(context);
    this.checkMultipleTerms(context);
    return context;
  }

  onExit = (context: QueryContext) => {
    // ToDo: validate current predicate now or during transcribing?
    // might even be able to remove the onExit hook.
    return context;
  };

  private checkPredicateLength(context: QueryContext) {
    if (
      context.taggedPredicates[context.currentPredicate - 1][0].length !== 1 &&
      context.taggedPredicates[context.currentPredicate - 1][0].length !== 3
    ) {
      // we must have form "x operator b", or a single value
      throw new Error("Invalid Query");
    }
  }

  private checkSingleTerm(context: QueryContext) {
    if (
      context.taggedPredicates[context.currentPredicate - 1][0].length === 1
    ) {
      // we must have a parens or a single value
      // ToDo: should we convert unions to objects to allow dot notation?
      // This checks that a single tagged token is of a type allowed to be
      // on it's own in a predicate;
      if (
        context.taggedPredicates[context.currentPredicate - 1][0][0][1] ===
        TokenType.ParensOpen
      ) {
        return;
      }
      if (
        context.taggedPredicates[context.currentPredicate - 1][0][0][1] ===
        TokenType.ParensClose
      ) {
        return;
      }
      if (
        context.taggedPredicates[context.currentPredicate - 1][0][0][1] ===
        TokenType.Value
      ) {
        return;
      }
      throw new Error("Invalid Query");
    }
  }

  private checkMultipleTerms(context: QueryContext) {
    if (
      context.taggedPredicates[context.currentPredicate - 1][0].length !== 1 &&
      context.taggedPredicates[context.currentPredicate - 1][0].length !== 3
    ) {
      // we must have form "x operator b", or a single value
      throw new Error("Invalid Query");
    }
  }

  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    // parens should be stored singly
    context.currentPredicate += 1;
    const taggedToken: TaggedToken = [token, TokenType.ParensClose];
    const tokenMap: TokenMap = [[taggedToken], PredicateType.parensClose];
    context.taggedPredicates[context.currentPredicate] = tokenMap;
    context.currentPos += token.length;

    return context;
  }
}
