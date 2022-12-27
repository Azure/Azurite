/**
 * Query state names are used in state store to
 * access and identify states
 *
 * @export
 * @enum {number}
 */
export enum QueryStateName {
  None,
  QueryStarted,
  QueryFinished,
  PredicateStarted,
  PredicateFinished,
  ProcessIdentifier,
  ProcessOperator,
  ProcessValue,
  ProcessPredicateOperator,
  ProcessParensOpen,
  ProcessParensClose
}
