import TaggedToken from "../TaggedToken";
import { TokenMap } from "../TokenMap";
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
  public convertPredicateForLokiJS() {
    const newTokens: TaggedToken[] = [];
    this.pushStringGuidPredicate(newTokens, this.tokenMap);
    newTokens.push(new TaggedToken("||", new OperatorToken()));
    this.pushBase64GuidPredicate(newTokens, this.tokenMap);
    this.tokenMap.tokens = newTokens;

    return this;
  }

  private pushBase64GuidPredicate(
    newTokens: TaggedToken[],
    taggedPredicate: TokenMap
  ) {
    newTokens.push(new TaggedToken("(", new ParensOpenToken()));
    taggedPredicate.tokens.forEach((taggedToken) => {
      if (taggedToken.type.isValue()) {
        const newToken = taggedToken.token.substring(
          5,
          taggedToken.token.length - 1
        );
        const guidBuff = Buffer.from(newToken);
        newTokens.push(
          new TaggedToken(`'${guidBuff.toString("base64")}'`, new ValueToken())
        );
      } else if (taggedToken.type.isIdentifier()) {
        newTokens.push(
          new TaggedToken(
            `item.properties.${taggedToken.token}`,
            new IdentifierToken()
          )
        );
      } else {
        newTokens.push(taggedToken);
      }
    });
    newTokens.push(new TaggedToken(")", new ParensCloseToken()));
  }

  private pushStringGuidPredicate(
    newTokens: TaggedToken[],
    taggedPredicate: TokenMap
  ) {
    newTokens.push(new TaggedToken("(", new ParensOpenToken()));
    taggedPredicate.tokens.forEach((taggedToken) => {
      if (taggedToken.type.isValue()) {
        const newToken = taggedToken.token.substring(4);
        newTokens.push(new TaggedToken(newToken, new ValueToken()));
      } else if (taggedToken.type.isIdentifier()) {
        newTokens.push(
          new TaggedToken(
            `item.properties.${taggedToken.token}`,
            new IdentifierToken()
          )
        );
      } else {
        newTokens.push(taggedToken);
      }
    });
    newTokens.push(new TaggedToken(")", new ParensCloseToken()));
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
    return false;
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
    return true;
  }
}
