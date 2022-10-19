import IPredicate from "./IPredicate";

export default class BinaryPredicate implements IPredicate {
  isUnknown(): boolean {
    return false;
  }
  isParensOpen(): boolean {
    return true;
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
    return false;
  }
  isBinaryValue(): boolean {
    return false;
  }
  isGuidValue(): boolean {
    return false;
  }
}
