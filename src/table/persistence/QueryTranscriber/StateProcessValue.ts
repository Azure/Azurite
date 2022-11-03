import IQPState from "./IQPState";
import { TokenMap } from "./PredicateModel/TokenMap";
import UnknownPredicate from "./PredicateModel/UnknownPredicate";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import TaggedToken from "./TokenModel/TaggedToken";
import ValueToken from "./TokenModel/ValueToken";

export default class StateProcessValue extends QPState implements IQPState {
  name = QueryStateName.ProcessValue;

  /**
   * processes the current token which is a value
   *
   * @param {QueryContext} context
   * @memberof StateProcessValue
   */
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.getNextToken(context);

    context = this.storeTaggedTokens(context, token);

    [context, token] = this.getNextToken(context);
    context = this.handleToken(context, token);

    return context;
  };

  /**
   * Determines the next token.
   * Overriden for the case of value processing
   * due to strings containing whitespace
   * @param context
   * @returns
   */
  protected override getNextToken(
    context: QueryContext
  ): [QueryContext, string] {
    // detmermine what the next token should be.
    // logic:
    // from current position in query string
    // determine start if token:
    let tokenStart: number;
    [context, tokenStart] = this.startofNextRelevantToken(context);
    // determine end:
    const tokenEnd = this.handleStringValue(context, tokenStart);
    return this.validateToken(context, tokenStart, tokenEnd);
  }

  private handleStringValue(context: QueryContext, tokenStart: number) {
    if (context.originalQuery[tokenStart] === "'") {
      return context.originalQuery.indexOf("'", tokenStart + 1) + 1;
    }
    return this.endOfToken(context, tokenStart);
  }

  protected handleToken(context: QueryContext, token: string): QueryContext {
    // categorize the token
    if (token === "") {
      context.stateQueue.push(QueryStateName.PredicateFinished);
    } else if (token === "(") {
      context.stateQueue.push(QueryStateName.PredicateStarted);
    } else if (token === ")") {
      context.stateQueue.push(QueryStateName.PredicateFinished);
    } else if (this.isPredicateOperator(token)) {
      if (this.name === QueryStateName.PredicateFinished) {
        context.stateQueue.push(QueryStateName.ProcessPredicateOperator);
      } else {
        context.stateQueue.push(QueryStateName.PredicateFinished);
      }
      // will need to end current predicate and create a new predicate
    } else if (this.isOperand(token)) {
      // match operand (specific set)
      context.stateQueue.push(QueryStateName.ProcessOperator);
    } else if (this.isValue(token)) {
      // match number (long & doubles? needed)
      // match string (starts with ', or " ?)
      // match guid (is exactly guid'<guidval>')
      context.stateQueue.push(QueryStateName.ProcessValue);
    } else if (this.isIdentifier(token)) {
      // match identifier (can only start with letter)
      context.stateQueue.push(QueryStateName.ProcessIdentifier);
    }

    return context;
  }

  /**
   * optional post processing, here we can add logging
   * or additional validation etc
   *
   * @param {QueryContext} context
   * @memberof StateProcessValue
   */
  onExit = (context: QueryContext) => {
    return context;
  };

  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    context = this.startNewPredicate(context);

    const taggedToken: TaggedToken = new TaggedToken(token, new ValueToken());

    const taggedTokens = this.updateTaggedTokens(context, taggedToken);
    context = this.updateTaggedPredicate(taggedTokens, context);

    context.currentPos += token.length;

    return context;
  }

  startNewPredicate(context: QueryContext): QueryContext {
    if (
      context.taggedPredicates[context.currentPredicate] !== undefined &&
      context.taggedPredicates[context.currentPredicate].tokenMap.tokens
        .length !== 0 &&
      (context.taggedPredicates[
        context.currentPredicate
      ].tokenMap.tokens[0].type.isParensOpen() ||
        context.taggedPredicates[
          context.currentPredicate
        ].tokenMap.tokens[0].type.isParensClose() ||
        context.taggedPredicates[
          context.currentPredicate
        ].tokenMap.tokens[0].type.isOperator())
    ) {
      context.taggedPredicates.push(new UnknownPredicate(new TokenMap([])));
      context.currentPredicate += 1;
    }
    return context;
  }
}
