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
    this.pushBase64GuidPredicate(newTokens, this.tokenMap);
    this.backWardCompatibleGuidMatch(newTokens, this.tokenMap);
    this.tokenMap.tokens = newTokens;
    return this;
  }

  /**
   * GUIDs were originally stored as plain strings, but this diverged from the
   * service, so we changed the storage format to base64 encoded strings.
   * To allow for transition between schemas, we update "equals / not equals"
   * queries to search for both plain string and base64 encoded.
   *
   * @param {TaggedToken[]} newTokens
   * @param {TokenMap} tokenMap
   * @memberof GuidPredicate
   */
  backWardCompatibleGuidMatch(newTokens: TaggedToken[], tokenMap: TokenMap) {
    if (this.isBackWardsCompatiblePredicate(tokenMap)) {
      this.pushPredicate(newTokens, this.tokenMap);
      this.pushStringGuidPredicate(newTokens, this.tokenMap);
    }
  }

  private isBackWardsCompatiblePredicate(tokenMap: TokenMap) {
    return (
      tokenMap.tokens[1].token === "===" || tokenMap.tokens[1].token === "!=="
    );
  }

  /**
   * adds an OR operator to allow query to return both base64 and string GUIDs
   * or an AND operator to retun GUIDs not matching either base64 or string rep
   * other operators cannot support backwards compatibility and require the
   * persistent storage (database) to be recreated
   *
   * @private
   * @param {TaggedToken[]} newTokens
   * @param {TokenMap} taggedPredicate
   * @memberof GuidPredicate
   */
  private pushPredicate(newTokens: TaggedToken[], tokenMap: TokenMap) {
    if (tokenMap.tokens[1].token === "===") {
      newTokens.push(new TaggedToken("||", new OperatorToken()));
    } else {
      newTokens.push(new TaggedToken("&&", new OperatorToken()));
    }
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
    if (this.isBackWardsCompatiblePredicate(taggedPredicate)) {
      newTokens.push(new TaggedToken("(", new ParensOpenToken()));
    }
    taggedPredicate.tokens.forEach((taggedToken) => {
      this.pushIdentifier(taggedToken, newTokens, this.isBackWardsCompatiblePredicate(taggedPredicate));
      this.pushOperator(taggedToken, newTokens);
      this.pushBase64Guid(taggedToken, newTokens);
    });
    if (this.isBackWardsCompatiblePredicate(taggedPredicate)) {
      newTokens.push(new TaggedToken(")", new ParensCloseToken()));
    }
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
      this.pushIdentifier(taggedToken, newTokens, false);
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
  private pushIdentifier(taggedToken: TaggedToken, newTokens: TaggedToken[], backwardCompatibleGuid : boolean) {
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
