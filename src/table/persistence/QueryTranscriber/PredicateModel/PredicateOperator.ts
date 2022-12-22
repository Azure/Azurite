import { TokenMap } from "./TokenMap";
import IPredicate from "./IPredicate";

export default class PredicateOperator implements IPredicate {
  tokenMap: TokenMap;
  constructor(tokenMap: TokenMap) {
    this.tokenMap = tokenMap;
  }

  /**
   * currently no special handling required
   *
   * @return {*}
   * @memberof PredicateOperator
   */
  public convertPredicateForLokiJS() {
    return this;
  }
}
