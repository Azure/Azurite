import { TokenMap } from "./TokenMap";

/**
 * Interface used with predicates to allow conversion
 * to different database representation / schemas
 *
 * @export
 * @interface IPredicate
 */
export default interface IPredicate {
  convertPredicateForLokiJS(): IPredicate;
  tokenMap: TokenMap;
}
