import TaggedToken from "../TokenModel/TaggedToken";
import { TokenMap } from "./TokenMap";
import IdentifierToken from "../TokenModel/IdentifierToken";
import OperatorToken from "../TokenModel/OperatorToken";
import ParensCloseToken from "../TokenModel/ParensCloseToken";
import ParensOpenToken from "../TokenModel/ParensOpenToken";
import ValueToken from "../TokenModel/ValueToken";
import IPredicate from "./IPredicate";

export default class GuidPredicate implements IPredicate {
  tokenMap: TokenMap;
  constructor(tokenMap: TokenMap) {
    this.tokenMap = tokenMap;
  }

  /**
   * Converts a guid predicate for lokijs schema
   * Guid predicate has special handling as we need to support
   * older schema for the cases that database is not new before
   * updating to new logic to differentiate between guid type
   * and string type
   *
   * @return {*}
   * @memberof GuidPredicate
   */
  public convertPredicateForLokiJS() {
    const newTokens: TaggedToken[] = [];
    this.pushStringGuidPredicate(newTokens, this.tokenMap);
    newTokens.push(new TaggedToken("||", new OperatorToken()));
    this.pushBase64GuidPredicate(newTokens, this.tokenMap);
    this.tokenMap.tokens = newTokens;
    return this;
  }

  /**
   * new schema converts guids to base64 representation
   *
   * @private
   * @param {TaggedToken[]} newTokens
   * @param {TokenMap} taggedPredicate
   * @memberof GuidPredicate
   */
  private pushBase64GuidPredicate(
    newTokens: TaggedToken[],
    taggedPredicate: TokenMap
  ) {
    newTokens.push(new TaggedToken("(", new ParensOpenToken()));
    taggedPredicate.tokens.forEach((taggedToken) => {
      this.pushIdentifier(taggedToken, newTokens);
      this.pushOperator(taggedToken, newTokens);
      this.pushBase64Guid(taggedToken, newTokens);
    });
    newTokens.push(new TaggedToken(")", new ParensCloseToken()));
  }

  /**
   * Pushes the base64 guid to the predicate
   *
   * @private
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof GuidPredicate
   */
  private pushBase64Guid(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isValue()) {
      const newToken = taggedToken.token.substring(
        5,
        taggedToken.token.length - 1
      );
      const guidBuff = Buffer.from(newToken);
      newTokens.push(
        new TaggedToken(`'${guidBuff.toString("base64")}'`, new ValueToken())
      );
    }
  }

  /**
   * old schema guids used string representation
   *
   * @private
   * @param {TaggedToken[]} newTokens
   * @param {TokenMap} taggedPredicate
   * @memberof GuidPredicate
   */
  private pushStringGuidPredicate(
    newTokens: TaggedToken[],
    taggedPredicate: TokenMap
  ) {
    newTokens.push(new TaggedToken("(", new ParensOpenToken()));
    taggedPredicate.tokens.forEach((taggedToken) => {
      this.pushStringGuid(taggedToken, newTokens);
      this.pushIdentifier(taggedToken, newTokens);
      this.pushOperator(taggedToken, newTokens);
    });
    newTokens.push(new TaggedToken(")", new ParensCloseToken()));
  }

  /**
   * Pushes the string guid to the predicate
   *
   * @private
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof GuidPredicate
   */
  private pushStringGuid(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isValue()) {
      const newToken = taggedToken.token.substring(4);
      newTokens.push(new TaggedToken(newToken, new ValueToken()));
    }
  }

  /**
   * Pushes the guid identifier to the predicate
   *
   * @private
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof GuidPredicate
   */
  private pushIdentifier(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
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
   * Pushes the operator to the guid predicate
   *
   * @private
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof GuidPredicate
   */
  private pushOperator(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isOperator()) {
      newTokens.push(taggedToken);
    }
  }
}
