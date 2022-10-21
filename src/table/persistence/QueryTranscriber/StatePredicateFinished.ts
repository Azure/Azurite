import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import { TokenMap } from "./PredicateModel/TokenMap";
import TaggedToken from "./TokenModel/TaggedToken";
import ParensCloseToken from "./TokenModel/ParensCloseToken";
import GuidPredicate from "./PredicateModel/GuidPredicate";
import BinaryPredicate from "./PredicateModel/BinaryPredicate";
import LongPredicate from "./PredicateModel/LongPredicate";
import DoublePredicate from "./PredicateModel/DoublePredicate";
import IntegerPredicate from "./PredicateModel/IntegerPredicate";
import StringPredicate from "./PredicateModel/StringPredicate";
import DatePredicate from "./PredicateModel/DatePredicate";
import BooleanPredicate from "./PredicateModel/BooleanPredicate";
import ParensClose from "./PredicateModel/ParensClose";

export default class StatePredicateFinished
  extends QPState
  implements IQPState
{
  name = QueryStateName.PredicateFinished;

  /**
   * when finishing a predicate, we need to update the query type
   * based on the value being queried
   *
   * @param {QueryContext} context
   * @memberof StatePredicateFinished
   */
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

  /**
   * validates the predicate using some simple logic
   * ToDo: ensure correct error codes!!!
   *
   * @param {QueryContext} context
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  validatePredicate(context: QueryContext): QueryContext {
    this.checkPredicateLength(context);
    this.checkSingleTerm(context);
    this.checkMultipleTerms(context);
    context = this.setPredicateType(context);
    return context;
  }

  /**
   * tags the predicate based on the type of value found in the
   * predicate terms
   *
   * @param {QueryContext} context
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  setPredicateType(context: QueryContext): QueryContext {
    if (context.taggedPredicates[context.currentPredicate] === undefined) {
      return context;
    }
    const taggedTokens =
      context.taggedPredicates[context.currentPredicate].tokenMap.tokens;
    // ToDo: decision should be moved out into a factory type for the predicates
    taggedTokens.forEach((taggedToken) => {
      if (taggedToken.type.isValue()) {
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

  /**
   * tags predicate for the case of a guid predicate
   *
   * @param {QueryContext} context
   * @param {string} tokenToCheck
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  ifGuidPredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isGuidValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate] = new GuidPredicate(
        context.taggedPredicates[context.currentPredicate].tokenMap
      );
      return context;
    }
    return context;
  }

  /**
   * tags predicate for the case of a binary value
   *
   * @param {QueryContext} context
   * @param {string} tokenToCheck
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  ifBinaryPredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isBinaryValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate] = new BinaryPredicate(
        context.taggedPredicates[context.currentPredicate].tokenMap
      );
      return context;
    }
    return context;
  }

  /**
   * tags predicate for the case of a long value
   *
   * @param {QueryContext} context
   * @param {string} tokenToCheck
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  ifLongPredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isLongValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate] = new LongPredicate(
        context.taggedPredicates[context.currentPredicate].tokenMap
      );
      return context;
    }
    return context;
  }

  /**
   * tags predicate for the case of a double value
   *
   * @param {QueryContext} context
   * @param {string} tokenToCheck
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  ifDoublePredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isDoubleValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate] = new DoublePredicate(
        context.taggedPredicates[context.currentPredicate].tokenMap
      );
      return context;
    }
    return context;
  }

  /**
   * tags predicate for the case of an integer value
   *
   * @param {QueryContext} context
   * @param {string} tokenToCheck
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  ifIntegerPredicate(
    context: QueryContext,
    tokenToCheck: string
  ): QueryContext {
    if (this.isIntegerValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate] = new IntegerPredicate(
        context.taggedPredicates[context.currentPredicate].tokenMap
      );
      return context;
    }
    return context;
  }

  /**
   * tags predicate for the case of a string value
   *
   * @param {QueryContext} context
   * @param {string} tokenToCheck
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  ifStringPredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isStringValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate] = new StringPredicate(
        context.taggedPredicates[context.currentPredicate].tokenMap
      );
      return context;
    }
    return context;
  }

  /**
   * tags predicate for the case of a date value
   *
   * @param {QueryContext} context
   * @param {string} tokenToCheck
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  ifDatePredicate(context: QueryContext, tokenToCheck: string): QueryContext {
    if (this.isDateValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate] = new DatePredicate(
        context.taggedPredicates[context.currentPredicate].tokenMap
      );
      return context;
    }
    return context;
  }

  /**
   * tags predicate for the case of a boolean value
   *
   * @param {QueryContext} context
   * @param {string} tokenToCheck
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  ifBooleanPredicate(
    context: QueryContext,
    tokenToCheck: string
  ): QueryContext {
    if (this.isBooleanValue(tokenToCheck)) {
      context.taggedPredicates[context.currentPredicate] = new BooleanPredicate(
        context.taggedPredicates[context.currentPredicate].tokenMap
      );
      return context;
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
    // ToDo: validate current predicate early or during transcribing?
    // might even be able to remove the onExit hooks.
    return context;
  };

  /**
   * checks the number of terms in a predicate based on the state
   * machines own logic (1 or 3 terms)
   *
   * @private
   * @param {QueryContext} context
   * @memberof StatePredicateFinished
   */
  private checkPredicateLength(context: QueryContext) {
    if (
      context.taggedPredicates[context.currentPredicate - 1].tokenMap.tokens
        .length !== 1 &&
      context.taggedPredicates[context.currentPredicate - 1].tokenMap.tokens
        .length !== 3
    ) {
      // we must have form "x operator b", or a single value
      throw new Error("Invalid Query");
    }
  }

  /**
   * checks a single term
   *
   * @private
   * @param {QueryContext} context
   * @return {*}
   * @memberof StatePredicateFinished
   */
  private checkSingleTerm(context: QueryContext) {
    if (
      context.taggedPredicates[context.currentPredicate - 1].tokenMap.tokens
        .length === 1
    ) {
      // we must have a parens or a single value
      // ToDo: should we convert unions to objects to allow dot notation?
      // This checks that a single tagged token is of a type allowed to be
      // on it's own in a predicate;
      if (
        context.taggedPredicates[
          context.currentPredicate - 1
        ].tokenMap.tokens[0].type.isParensOpen()
      ) {
        return;
      }
      if (
        context.taggedPredicates[
          context.currentPredicate - 1
        ].tokenMap.tokens[0].type.isParensClose()
      ) {
        return;
      }
      if (
        context.taggedPredicates[
          context.currentPredicate - 1
        ].tokenMap.tokens[0].type.isValue()
      ) {
        return;
      }
      throw new Error("Invalid Query");
    }
  }

  /**
   * checks multiple terms
   *
   * @private
   * @param {QueryContext} context
   * @memberof StatePredicateFinished
   */
  private checkMultipleTerms(context: QueryContext) {
    if (
      context.taggedPredicates[context.currentPredicate - 1].tokenMap.tokens
        .length !== 1 &&
      context.taggedPredicates[context.currentPredicate - 1].tokenMap.tokens
        .length !== 3
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
      new ParensCloseToken()
    );
    const tokenMap: TokenMap = new TokenMap([taggedToken]);
    context.taggedPredicates[context.currentPredicate] = new ParensClose(
      tokenMap
    );
    context.currentPos += token.length;

    return context;
  }
}
