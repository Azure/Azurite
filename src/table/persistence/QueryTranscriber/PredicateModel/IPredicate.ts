import { TokenMap } from "./TokenMap";

export default interface IPredicate {
  convertPredicateForLokiJS(): IPredicate;
  tokenMap: TokenMap;
}
