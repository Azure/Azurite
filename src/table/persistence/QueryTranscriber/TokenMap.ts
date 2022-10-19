import IPredicate from "./PredicateModel/IPredicate";
import UnknownPredicate from "./PredicateModel/UnknownPredicate";
import TaggedToken from "./TaggedToken";

export class TokenMap {
  public tokens: TaggedToken[] = [];
  public predicateType: IPredicate = new UnknownPredicate();
  constructor(
    tokens: TaggedToken[] = [],
    predicateType: IPredicate = new UnknownPredicate()
  ) {
    this.tokens = tokens;
    this.predicateType = predicateType;
  }
}
