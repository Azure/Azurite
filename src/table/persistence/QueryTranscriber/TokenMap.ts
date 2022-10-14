import { PredicateType } from "./PredicateType";
import TaggedToken from "./TaggedToken";

export class TokenMap {
  public tokens: TaggedToken[] = [];
  public predicateType: PredicateType = PredicateType.unknown;
  constructor(
    tokens: TaggedToken[] = [],
    predicateType: PredicateType = PredicateType.unknown
  ) {
    this.tokens = tokens;
    this.predicateType = predicateType;
  }
}
