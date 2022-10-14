/**
 * What type of value is a predicate evaluating
 * based on EdmType
 *
 * @export
 * @enum {number}
 */
export enum PredicateType {
  "unknown",
  "parensOpen",
  "parensClose",
  "stringValue",
  "integerValue",
  "booleanValue",
  "dateValue",
  "doubleValue",
  "longValue",
  "binaryValue",
  "guidValue"
}
