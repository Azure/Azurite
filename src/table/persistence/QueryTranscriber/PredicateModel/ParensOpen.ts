import { TokenMap } from "./TokenMap";
import IPredicate from "./IPredicate";

export default class BinaryPredicate implements IPredicate {
  tokenMap: TokenMap;
  constructor(tokenMap: TokenMap) {
    this.tokenMap = tokenMap;
  }

  /**
   * currently no special handling required
   *
   * @return {*}
   * @memberof ParensClose
   */
  public convertPredicateForLokiJS() {
    return this;
  }
}
