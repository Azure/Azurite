import TaggedToken from "../TokenModel/TaggedToken";
import { TokenMap } from "./TokenMap";
import IdentifierToken from "../TokenModel/IdentifierToken";
import ValueToken from "../TokenModel/ValueToken";
import IPredicate from "./IPredicate";

export default class DatePredicate implements IPredicate {
  tokenMap: TokenMap;
  constructor(tokenMap: TokenMap) {
    this.tokenMap = tokenMap;
  }

  /**
   * converts a datetime predicate for lokijs schema
   *
   * @return {*}
   * @memberof DatePredicate
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
   * pushes value for date predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof DatePredicate
   */
  pushValue(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isValue()) {
      newTokens.push(
        new TaggedToken(
          "new Date(" +
            taggedToken.token.substring(8, taggedToken.token.length) +
            ").getTime()",
          new ValueToken()
        )
      );
    }
  }

  /**
   * pushes identifier in a date predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof DatePredicate
   */
  pushIdentifier(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isIdentifier()) {
      newTokens.push(
        new TaggedToken(
          `new Date(item.properties.${taggedToken.token}).getTime()`,
          new IdentifierToken()
        )
      );
    }
  }

  /**
   * Pushes operator in a date predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof DatePredicate
   */
  pushOperator(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isOperator()) {
      newTokens.push(taggedToken);
    }
  }
}
