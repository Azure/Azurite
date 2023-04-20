import TaggedToken from "../TokenModel/TaggedToken";
import { TokenMap } from "./TokenMap";
import IdentifierToken from "../TokenModel/IdentifierToken";
import ValueToken from "../TokenModel/ValueToken";
import IPredicate from "./IPredicate";
import OperatorToken from "../TokenModel/OperatorToken";

export default class IntegerPredicate implements IPredicate {
  tokenMap: TokenMap;
  constructor(tokenMap: TokenMap) {
    this.tokenMap = tokenMap;
  }

  /**
   * Converts an integer predicate for lokijs schema
   *
   * @return {*}
   * @memberof IntegerPredicate
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
   * Pushes the value to the integer predicate
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
   * Pushes the identifier to the integer predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof IntegerPredicate
   */
  pushIdentifier(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isIdentifier()) {
      const newToken = new TaggedToken(`item.properties.${taggedToken.token}`, new IdentifierToken());
      // When querying storage and you give it a field comparison, it eliminates anything with doesn't have that field
      // Add a hasOwnProperty check to mimic that behavior for any identifier that we get and remove entities without that field
      // Finish the predicate if it is already started, otherwise add this before the predicate starts
      if (newTokens.length > 1 && newTokens[newTokens.length - 1].type.isOperator() && newTokens[newTokens.length - 2].type.isValue()) {
        newTokens.push(newToken);
        if (taggedToken.token.toLocaleLowerCase() !== "**blena**"){
          this.pushOperator(new TaggedToken("&&", new OperatorToken()), newTokens);
          newTokens.push((new TaggedToken(`item.properties.hasOwnProperty("${taggedToken.token}")`, new IdentifierToken())));
        }
      }
      else {
        if (taggedToken.token.toLocaleLowerCase() !== "**blena**"){
          newTokens.push((new TaggedToken(`item.properties.hasOwnProperty("${taggedToken.token}")`, new IdentifierToken())));
          this.pushOperator(new TaggedToken("&&", new OperatorToken()), newTokens);
        }
        newTokens.push(newToken);
      }
    }
  }

  /**
   * Pushes the operator to the integer predicate
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
