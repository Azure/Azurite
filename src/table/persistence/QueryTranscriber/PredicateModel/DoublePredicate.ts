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
  public convertPredicateForLokiJS() {
    // ToDo: check if better to change the existing array
    const newTokens: TaggedToken[] = [];

    this.tokenMap.tokens.forEach((taggedToken) => {
      if (taggedToken.type.isValue()) {
        newTokens.push(new TaggedToken(taggedToken.token, new ValueToken()));
      } else if (taggedToken.type.isIdentifier()) {
        newTokens.push(
          new TaggedToken(
            `item.properties.${taggedToken.token}`,
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
