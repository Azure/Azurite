import { TokenMap } from "./TokenMap";
import IPredicate from "./IPredicate";
import IdentifierToken from "../TokenModel/IdentifierToken";
import TaggedToken from "../TokenModel/TaggedToken";
import ValueToken from "../TokenModel/ValueToken";
import OperatorToken from "../TokenModel/OperatorToken";

export default class BinaryPredicate implements IPredicate {
  tokenMap: TokenMap;
  constructor(tokenMap: TokenMap) {
    this.tokenMap = tokenMap;
  }

  /**
   * Converts a binary predicate for LokiJs filter
   *
   * @return {*}
   * @memberof BinaryPredicate
   */
  public convertPredicateForLokiJS() {
    const newTokens: TaggedToken[] = [];
    try {
      this.tokenMap.tokens.forEach((taggedToken) => {
        this.pushValue(taggedToken, newTokens);
        this.pushIdentifier(taggedToken, newTokens);
        this.pushOperator(taggedToken, newTokens);
      });
      this.tokenMap.tokens = newTokens;
    } catch (err) {
      throw err;
    }

    return this;
  }

  /**
   * Pushes value for boolean predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof BooleanPredicate
   */
  pushValue(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isValue()) {
      // assumption is that we have a binary value which needs to be
      // converted to base64
      // decision on type is made earlier so no additional check
      const trim = this.getTrimLength(taggedToken.token);
      const binaryString = taggedToken.token.slice(
        trim,
        taggedToken.token.length - 1
      );

      const base64String = Buffer.from(binaryString, "hex").toString("base64");
      newTokens.push(
        new TaggedToken("'" + base64String + "'", new ValueToken())
      );
    }
  }

  getTrimLength(token: string): number {
    if (token.match(/^X\'/) !== null) {
      return 2;
    } else if (token.match(/^binary\'/) !== null) {
      return 7;
    }
    return 0;
  }

  /**
   * pushes identifier for boolean predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof BooleanPredicate
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
   * pushes operator for boolean predicate
   *
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof BooleanPredicate
   */
  pushOperator(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isOperator()) {
      newTokens.push(taggedToken);
    }
  }
}
