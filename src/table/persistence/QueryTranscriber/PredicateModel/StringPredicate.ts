import TaggedToken from "../TaggedToken";
import { TokenMap } from "../TokenMap";
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
      if (taggedToken.type.isValue()) {
        newTokens.push(new TaggedToken(taggedToken.token, new ValueToken()));
      } else if (taggedToken.type.isIdentifier()) {
        // ToDo: Add case for TableName!?!
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
  isUnknown(): boolean {
    return false;
  }
  isParensOpen(): boolean {
    return false;
  }
  isParensClose(): boolean {
    return false;
  }
  isStringValue(): boolean {
    return true;
  }
  isIntegerValue(): boolean {
    return false;
  }
  isBooleanValue(): boolean {
    return false;
  }
  isDateValue(): boolean {
    return false;
  }
  isDoubleValue(): boolean {
    return false;
  }
  isLongValue(): boolean {
    return false;
  }
  isBinaryValue(): boolean {
    return false;
  }
  isGuidValue(): boolean {
    return false;
  }
}
