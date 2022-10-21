import { TokenMap } from "./TokenMap";
import IPredicate from "./IPredicate";

export default class BinaryPredicate implements IPredicate {
  tokenMap: TokenMap;
  constructor(tokenMap: TokenMap) {
    this.tokenMap = tokenMap;
  }

  /**
   * ToDo: not yet implemented
   *
   * @return {*}
   * @memberof BinaryPredicate
   */
  public convertPredicateForLokiJS() {
    return this;
  }
}
