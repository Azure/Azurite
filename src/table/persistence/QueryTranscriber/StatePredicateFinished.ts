import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import { PredicateType } from "./PredicateType";
import { TokenMap } from "./TokenMap";
import { TokenType } from "./TokenType";
import TaggedToken from "./TaggedToken";

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
    context = this.setPredicateType(context);
    return context;
  }

  setPredicateType(context: QueryContext): QueryContext {
    const taggedTokens =
      context.taggedPredicates[context.currentPredicate].tokens;
    taggedTokens.forEach((taggedToken) => {
      if (taggedToken.type === TokenType.Value) {
        context = this.ifGuidPredicate(context, taggedToken.token);
        context = this.ifBinaryPredicate(context, taggedToken.token);
        context = this.ifLongPredicate(context, taggedToken.token);
        context = this.ifDoublePredicate(context, taggedToken.token);
        context = this.ifIntegerPredicate(context, taggedToken.token);
        context = this.ifStringPredicate(context, taggedToken.token);
        context = this.ifDatePredicate(context, taggedToken.token);
        context = this.ifBooleanPredicate(context, taggedToken.token);
      }
    });
    return context;
  }

  ifGuidPredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isGuidValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate - 1].predicateType =
        PredicateType.guidValue;
      return context;
    }
    return context;
  }

  ifBinaryPredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isBinaryValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate - 1].predicateType =
        PredicateType.binaryValue;
      return context;
    }
    return context;
  }

  ifLongPredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isLongValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate - 1].predicateType =
        PredicateType.longValue;
      return context;
    }
    return context;
  }

  ifDoublePredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isDoubleValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate - 1].predicateType =
        PredicateType.doubleValue;
      return context;
    }
    return context;
  }

  ifIntegerPredicate(
    context: QueryContext,
    tokenToCheck: string
  ): QueryContext {
    if (this.isIntegerValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate - 1].predicateType =
        PredicateType.integerValue;
      return context;
    }
    return context;
  }

  ifStringPredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isStringValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate - 1].predicateType =
        PredicateType.stringValue;
      return context;
    }
    return context;
  }

  ifDatePredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isDateValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate - 1].predicateType =
        PredicateType.dateValue;
      return context;
    }
    return context;
  }

  ifBooleanPredicate(
    context: QueryContext,
    tokenToCheck: string
  ): QueryContext {
    if (this.isBooleanValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate - 1].predicateType =
        PredicateType.booleanValue;
      return context;
    }
    return context;
  }

  onExit = (context: QueryContext) => {
    // ToDo: validate current predicate now or during transcribing?
    // might even be able to remove the onExit hooks.
    return context;
  };

  private checkPredicateLength(context: QueryContext) {
    if (
      context.taggedPredicates[context.currentPredicate - 1].tokens.length !==
        1 &&
      context.taggedPredicates[context.currentPredicate - 1].tokens.length !== 3
    ) {
      // we must have form "x operator b", or a single value
      throw new Error("Invalid Query");
    }
  }

  private checkSingleTerm(context: QueryContext) {
    if (
      context.taggedPredicates[context.currentPredicate - 1].tokens.length === 1
    ) {
      // we must have a parens or a single value
      // ToDo: should we convert unions to objects to allow dot notation?
      // This checks that a single tagged token is of a type allowed to be
      // on it's own in a predicate;
      if (
        context.taggedPredicates[context.currentPredicate - 1].tokens[0]
          .type === TokenType.ParensOpen
      ) {
        return;
      }
      if (
        context.taggedPredicates[context.currentPredicate - 1].tokens[0]
          .type === TokenType.ParensClose
      ) {
        return;
      }
      if (
        context.taggedPredicates[context.currentPredicate - 1].tokens[0]
          .type === TokenType.Value
      ) {
        return;
      }
      throw new Error("Invalid Query");
    }
  }

  private checkMultipleTerms(context: QueryContext) {
    if (
      context.taggedPredicates[context.currentPredicate - 1].tokens.length !==
        1 &&
      context.taggedPredicates[context.currentPredicate - 1].tokens.length !== 3
    ) {
      // we must have form "x operator b", or a single value
      throw new Error("Invalid Query");
    }
  }

  /**
   * Function name still set to be generic in case it is defined in interface
   * Otherwise should be renamed to indicate that it only stores a parens
   *
   * @private
   * @param {QueryContext} context
   * @param {string} token
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    // parens should be stored singly
    context.currentPredicate += 1;
    const taggedToken: TaggedToken = new TaggedToken(
      token,
      TokenType.ParensClose
    );
    const tokenMap: TokenMap = new TokenMap(
      [taggedToken],
      PredicateType.parensClose
    );
    context.taggedPredicates[context.currentPredicate] = tokenMap;
    context.currentPos += token.length;

    return context;
  }
}
