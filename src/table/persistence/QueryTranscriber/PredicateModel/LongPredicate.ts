import IPredicate from "./IPredicate";

export default class LongPredicate implements IPredicate {
  isUnknown(): boolean {
    return false;
  }
  isParensOpen(): boolean {
    return false;
  }
  isParensClose(): boolean {
    return false;
  }
  isStringValue(): boolean {
    return false;
  }
  isIntegerValue(): boolean {
    return false;
  }
  isBooleanValue(): boolean {
    return false;
  }
  isDateValue(): boolean {
    return false;
  }
  isDoubleValue(): boolean {
    return false;
  }
  isLongValue(): boolean {
    return true;
  }
  isBinaryValue(): boolean {
    return false;
  }
  isGuidValue(): boolean {
    return false;
  }
}
