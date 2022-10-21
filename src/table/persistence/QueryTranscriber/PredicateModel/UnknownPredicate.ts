import { TokenMap } from "./TokenMap";
import IPredicate from "./IPredicate";

export default class UnknownPredicate implements IPredicate {
  tokenMap: TokenMap;
  constructor(tokenMap: TokenMap) {
    this.tokenMap = tokenMap;
  }
  public convertPredicateForLokiJS() {
    return this;
  }
}
