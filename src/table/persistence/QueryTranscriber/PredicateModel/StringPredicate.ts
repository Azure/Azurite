import TaggedToken from "../TokenModel/TaggedToken";
import { TokenMap } from "./TokenMap";
import IdentifierToken from "../TokenModel/IdentifierToken";
import ValueToken from "../TokenModel/ValueToken";
import IPredicate from "./IPredicate";

export default class StringPredicate implements IPredicate {
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
   * pushes the value to the string predicate
   *
   * @private
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof StringPredicate
   */
  private pushValue(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isValue()) {
      newTokens.push(new TaggedToken(taggedToken.token, new ValueToken()));
    }
  }

  /**
   * pushes the identifier to the string predicate
   *
   * @private
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof StringPredicate
   */
  private pushIdentifier(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isIdentifier()) {
      const newToken = this.createStringIdentifierToken(taggedToken.token);
      newTokens.push(newToken);
    }
  }

  /**
   * handles the special case for "TableName"
   *
   * @param {string} token
   * @return {*}
   * @memberof StringPredicate
   */
  createStringIdentifierToken(token: string) {
    if (token.toLocaleLowerCase() === "tablename") {
      return new TaggedToken(`name`, new IdentifierToken());
    }
    return new TaggedToken(`item.properties.${token}`, new IdentifierToken());
  }

  /**
   * pushes the operator to the string predicate
   *
   * @private
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof StringPredicate
   */
  private pushOperator(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isOperator()) {
      newTokens.push(taggedToken);
    }
  }
}
