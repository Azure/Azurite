import { TokenMap } from "../TokenMap";
import IPredicate from "./IPredicate";

export default class UnknownPredicate implements IPredicate {
  tokenMap: TokenMap;
  constructor(tokenMap: TokenMap) {
    this.tokenMap = tokenMap;
  }
  public convertPredicateForLokiJS() {
    return this;
  }
  isUnknown(): boolean {
    return true;
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
    return false;
  }
  isBinaryValue(): boolean {
    return false;
  }
  isGuidValue(): boolean {
    return false;
  }
}
