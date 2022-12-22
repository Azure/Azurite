import TaggedToken from "../TokenModel/TaggedToken";

/**
 * Contains a map of the predicate with tagged tokens indicating
 * their role in the predicate.
 *
 * @export
 * @class TokenMap
 */
export class TokenMap {
  public tokens: TaggedToken[] = [];
  constructor(tokens: TaggedToken[] = []) {
    this.tokens = tokens;
  }
}
