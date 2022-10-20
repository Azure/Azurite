import { TokenMap } from "../TokenMap";

export default interface IPredicate {
  convertPredicateForLokiJS(): IPredicate;
  tokenMap: TokenMap;
  isUnknown(): boolean;
  isBinaryValue(): boolean;
  isBooleanValue(): boolean;
  isDateValue(): boolean;
  isDoubleValue(): boolean;
  isGuidValue(): boolean;
  isIntegerValue(): boolean;
  isLongValue(): boolean;
  isParensClose(): boolean;
  isParensOpen(): boolean;
  isStringValue(): boolean;
}
