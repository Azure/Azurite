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

  public convertPredicateForLokiJS() {
    // ToDo: check if better to change the existing array
    const newTokens: TaggedToken[] = [];

    this.tokenMap.tokens.forEach((taggedToken) => {
      if (taggedToken.type.isValue()) {
        newTokens.push(
          new TaggedToken(
            taggedToken.token.substring(8, taggedToken.token.length),
            new ValueToken()
          )
        );
      } else if (taggedToken.type.isIdentifier()) {
        newTokens.push(
          new TaggedToken(
            `new Date(item.properties.${taggedToken.token}).getTime()`,
            new IdentifierToken()
          )
        );
      } else {
        // is operator
        newTokens.push(taggedToken);
      }
    });
    this.tokenMap.tokens = newTokens;

    return this;
  }
}
