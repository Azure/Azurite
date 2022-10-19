import IPredicate from "./IPredicate";

export default class ParensClose implements IPredicate {
  isUnknown(): boolean {
    return false;
  }
  isParensOpen(): boolean {
    return false;
  }
  isParensClose(): boolean {
    return true;
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
