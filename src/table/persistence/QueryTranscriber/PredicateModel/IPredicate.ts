export default interface IPredicate {
  isUnknown(): boolean;
  isParensOpen(): boolean;
  isParensClose(): boolean;
  isStringValue(): boolean;
  isIntegerValue(): boolean;
  isBooleanValue(): boolean;
  isDateValue(): boolean;
  isDoubleValue(): boolean;
  isLongValue(): boolean;
  isBinaryValue(): boolean;
  isGuidValue(): boolean;
}
