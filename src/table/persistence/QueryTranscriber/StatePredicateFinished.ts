import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import GuidPredicate from "./PredicateModel/GuidPredicate";
import BinaryPredicate from "./PredicateModel/BinaryPredicate";
import LongPredicate from "./PredicateModel/LongPredicate";
import DoublePredicate from "./PredicateModel/DoublePredicate";
import IntegerPredicate from "./PredicateModel/IntegerPredicate";
import StringPredicate from "./PredicateModel/StringPredicate";
import DatePredicate from "./PredicateModel/DatePredicate";
import BooleanPredicate from "./PredicateModel/BooleanPredicate";

/**
 * contains the logic for checking a predicate when it is finished
 *
 * @export
 * @class StatePredicateFinished
 * @extends {QPState}
 * @implements {IQPState}
 */
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

    [context, token] = this.getNextToken(context);

    context = this.handleToken(context, token);

    return context;
  };

  /**
   * state transition logic
   *
   * @protected
   * @param {QueryContext} context
   * @param {string} token
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  protected handleToken(context: QueryContext, token: string): QueryContext {
    // categorize the token
    if (token === "") {
      context.stateQueue.push(QueryStateName.QueryFinished);
    } else if (token === "(") {
      context.stateQueue.push(QueryStateName.PredicateStarted);
    } else if (token === ")") {
      context.stateQueue.push(QueryStateName.ProcessParensClose);
    } else if (this.isPredicateOperator(token)) {
      context.stateQueue.push(QueryStateName.ProcessPredicateOperator);
      // will need to end current predicate and create a new predicate
    } else if (this.isOperand(token)) {
      // match operand (specific set)
      throw new Error(
        "Invalid Query, unable to process operand starting predicate!"
      );
    } else if (this.isValue(token)) {
      // match number (long & doubles? needed)
      // match string (starts with ', or " ?)
      // match guid (is exactly guid'<guidval>')
      context.stateQueue.push(QueryStateName.PredicateStarted);
    } else if (this.isIdentifier(token)) {
      // match identifier (can only start with letter)
      context.stateQueue.push(QueryStateName.PredicateStarted);
    }

    return context;
  }

  /**
   * validates the predicate using some simple logic
   * ToDo: ensure correct error codes!!!
   *
   * @param {QueryContext} context
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  private validatePredicate(context: QueryContext): QueryContext {
    const predicateOffset: number = this.getPredicateOffsetToCheck(context);
    this.checkPredicateLength(predicateOffset, context);
    this.checkSingleTerm(predicateOffset, context);
    this.checkMultipleTerms(predicateOffset, context);
    context = this.setPredicateType(context);
    return context;
  }

  private getPredicateOffsetToCheck(context: QueryContext): number {
    return context.currentPredicate > 0 ? context.currentPredicate - 1 : 0;
  }

  /**
   * tags the predicate based on the type of value found in the
   * predicate terms
   *
   * @param {QueryContext} context
   * @return {*}  {QueryContext}
   * @memberof StatePredicateFinished
   */
  private setPredicateType(context: QueryContext): QueryContext {
    if (context.taggedPredicates[context.currentPredicate] === undefined) {
      return context;
    }
    const taggedTokens =
      context.taggedPredicates[context.currentPredicate].tokenMap.tokens;

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
  private ifGuidPredicate(
    context: QueryContext,
    tokenToCheck: string
  ): QueryContext {
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
  private ifBinaryPredicate(
    context: QueryContext,
    tokenToCheck: string
  ): QueryContext {
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
  private ifLongPredicate(
    context: QueryContext,
    tokenToCheck: string
  ): QueryContext {
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
  private ifDoublePredicate(
    context: QueryContext,
    tokenToCheck: string
  ): QueryContext {
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
  private ifIntegerPredicate(
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
  private ifStringPredicate(
    context: QueryContext,
    tokenToCheck: string
  ): QueryContext {
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
  private ifDatePredicate(
    context: QueryContext,
    tokenToCheck: string
  ): QueryContext {
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
  private ifBooleanPredicate(
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
  private checkPredicateLength(offset: number, context: QueryContext) {
    if (
      context.taggedPredicates[offset].tokenMap.tokens.length !== 1 &&
      context.taggedPredicates[offset].tokenMap.tokens.length !== 3
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
  private checkSingleTerm(offset: number, context: QueryContext) {
    if (context.taggedPredicates[offset].tokenMap.tokens.length === 1) {
      // we must have a parens or a single value
      // ToDo: validate this logic has parity with Azure service
      // This checks that a single tagged token is of a type allowed to be
      // on it's own in a predicate;
      const predicateType =
        context.taggedPredicates[offset].tokenMap.tokens[0].type;
      if (
        predicateType.isParensOpen() ||
        predicateType.isParensClose() ||
        predicateType.isOperator()
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
  private checkMultipleTerms(offset: number, context: QueryContext) {
    if (context.taggedPredicates[offset].tokenMap.tokens.length === 3) {
      // we must have form "x operator b"
      this.checkNumberOfValues(offset, context);
      this.checkNumberOfOperators(offset, context);
      this.checkNumberOfIdentifiers(offset, context);
    }
  }

  /**
   * Checks that there is only 1 value in the predicate
   *
   * @private
   * @param {number} offset
   * @param {QueryContext} context
   * @memberof StatePredicateFinished
   */
  private checkNumberOfValues(offset: number, context: QueryContext) {
    let valueCount = 0;
    context.taggedPredicates[offset].tokenMap.tokens.forEach((taggedToken) => {
      if (taggedToken.type.isValue()) {
        valueCount++;
      }
    });
    this.checkPredicateTermCount(valueCount);
  }

  /**
   * Checks that there is only 1 identifier in the predicate
   *
   * @private
   * @param {number} offset
   * @param {QueryContext} context
   * @memberof StatePredicateFinished
   */
  private checkNumberOfIdentifiers(offset: number, context: QueryContext) {
    let valueCount = 0;
    context.taggedPredicates[offset].tokenMap.tokens.forEach((taggedToken) => {
      if (taggedToken.type.isIdentifier()) {
        valueCount++;
      }
    });
    this.checkPredicateTermCount(valueCount);
  }

  /**
   * Checks that there is only 1 operator in the predicate
   *
   * @private
   * @param {number} offset
   * @param {QueryContext} context
   * @memberof StatePredicateFinished
   */
  private checkNumberOfOperators(offset: number, context: QueryContext) {
    let valueCount = 0;
    context.taggedPredicates[offset].tokenMap.tokens.forEach((taggedToken) => {
      if (taggedToken.type.isOperator()) {
        valueCount++;
      }
    });
    this.checkPredicateTermCount(valueCount);
  }

  /**
   * checks that there is only 1 of this type of term
   *
   * @private
   * @param {number} count
   * @memberof StatePredicateFinished
   */
  private checkPredicateTermCount(count: number) {
    if (count !== 1) {
      throw new Error("Invalid number of terms in query!");
    }
  }
}
