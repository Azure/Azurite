import TaggedToken from "../TokenModel/TaggedToken";
import { TokenMap } from "./TokenMap";
import IdentifierToken from "../TokenModel/IdentifierToken";
import ValueToken from "../TokenModel/ValueToken";
import IPredicate from "./IPredicate";

export default class DoublePredicate implements IPredicate {
  tokenMap: TokenMap;
  constructor(tokenMap: TokenMap) {
    this.tokenMap = tokenMap;
  }

  /**
   * converts a double predicate for lokijs schema
   *
   * @return {*}
   * @memberof DoublePredicate
   */
  public convertPredicateForLokiJS() {
    const newTokens: TaggedToken[] = [];

    this.tokenMap.tokens.forEach((taggedToken) => {
      this.pushValue(taggedToken, newTokens);
      this.pushIdentifier(taggedToken, newTokens);
      this.pushOperator(taggedToken, newTokens);
    });
    this.tokenMap.tokens = newTokens;

    return this;
  }

  /**
   * pushes value for double predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof DoublePredicate
   */
  pushValue(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isValue()) {
      newTokens.push(new TaggedToken(taggedToken.token, new ValueToken()));
    }
  }

  /**
   * pushes identifier for double predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof DoublePredicate
   */
  pushIdentifier(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isIdentifier()) {
      newTokens.push(
        new TaggedToken(
          `item.properties.${taggedToken.token}`,
          new IdentifierToken()
        )
      );
    }
  }

  /**
   * pushes operator for double predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof DoublePredicate
   */
  pushOperator(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isOperator()) {
      newTokens.push(taggedToken);
    }
  }
}
