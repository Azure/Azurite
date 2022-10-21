import TaggedToken from "../TokenModel/TaggedToken";
import { TokenMap } from "./TokenMap";
import IdentifierToken from "../TokenModel/IdentifierToken";
import ValueToken from "../TokenModel/ValueToken";
import IPredicate from "./IPredicate";

export default class IntegerPredicate implements IPredicate {
  tokenMap: TokenMap;
  constructor(tokenMap: TokenMap) {
    this.tokenMap = tokenMap;
  }

  public convertPredicateForLokiJS() {
    // ToDo: check if better to change the existing array
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
   * pushes the value to the integer predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof IntegerPredicate
   */
  pushValue(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isValue()) {
      newTokens.push(new TaggedToken(taggedToken.token, new ValueToken()));
    }
  }

  /**
   * pushes the identifier to the integer predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof IntegerPredicate
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
   * pushes the operator to the integer predicate
   *
   * @private
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof IntegerPredicate
   */
  private pushOperator(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isOperator()) {
      newTokens.push(taggedToken);
    }
  }
}
