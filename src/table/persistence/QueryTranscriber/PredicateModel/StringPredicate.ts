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

  /**
   * converts a string predicate for lokijs schema
   *
   * @return {*}
   * @memberof StringPredicate
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
   * Pushes the value to the string predicate
   *
   * @private
   * @param {TaggedToken} taggedToken
   * @param {TaggedToken[]} newTokens
   * @memberof StringPredicate
   */
  private pushValue(taggedToken: TaggedToken, newTokens: TaggedToken[]) {
    if (taggedToken.type.isValue()) {
      taggedToken.token =
        "'" +
        // We also need to convert any double apostrophes into their corresponding backslash-escaped variant
        this.replaceDoubleApostrophes(
          // Let's ensure that backslashes (which are valid characters in the OData space) are escaped correctly.
          this.escapeReservedCharacters(
            taggedToken.token.substring(1, taggedToken.token.length - 1)
          )) +
        "'";

      newTokens.push(new TaggedToken(taggedToken.token, new ValueToken()));
    }
  }

  /**
   * Ensure that the presence of a '' in the string is converted into the explicit ' (apostrophe) character.
   *
   * @param {string} token 
   * @memberof StringPredicate
   * @returns {string}
   */
  private replaceDoubleApostrophes(token: string) {
    return token.replace(/(\'\')/g, "\\'");
  }

  /**
   * Ensures that backticks (which are used to encode the string)
   *
   * @param {string} token
   * @memberof StringPredicate
   * @returns {string}
   */
  private escapeReservedCharacters(token: string) {
    return token.replace(/\\/g, "\\\\");
  }

  /**
   * Pushes the identifier to the string predicate
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
    // asterisk is not allowed in an identifier
    if (token.toLocaleLowerCase() === "**blena**") {
      return new TaggedToken(`item.table`, new IdentifierToken());
    }
    return new TaggedToken(`item.properties.${token}`, new IdentifierToken());
  }

  /**
   * Pushes the operator to the string predicate
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
