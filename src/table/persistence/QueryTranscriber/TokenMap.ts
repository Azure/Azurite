import IPredicate from "./PredicateModel/IPredicate";
import UnknownPredicate from "./PredicateModel/UnknownPredicate";
import TaggedToken from "./TaggedToken";
import IdentifierToken from "./TokenModel/IdentifierToken";
import OperatorToken from "./TokenModel/OperatorToken";
import ParensCloseToken from "./TokenModel/ParensCloseToken";
import ParensOpenToken from "./TokenModel/ParensOpenToken";
import ValueToken from "./TokenModel/ValueToken";

/**
 * Contains a map of the predicate with tagged tokens indicating
 * their role in the predicate.
 *
 * @export
 * @class TokenMap
 */
export class TokenMap {
  public tokens: TaggedToken[] = [];
  public predicateType: IPredicate = new UnknownPredicate();
  constructor(
    tokens: TaggedToken[] = [],
    predicateType: IPredicate = new UnknownPredicate()
  ) {
    this.tokens = tokens;
    this.predicateType = predicateType;
  }

  /**
   * adds additional "OR" clause predicate in the form:
   * ( <original predicate> || <backwards compatible predicate>)
   *
   * @param {TokenMap} taggedPredicate
   * @return {*}  {TokenMap}
   * @memberof StateQueryFinished
   */
  convertGuidPredicate(): TokenMap {
    if (this.predicateType.isGuidValue()) {
      const newTokens: TaggedToken[] = [];
      this.pushStringGuidPredicate(newTokens, this);
      newTokens.push(new TaggedToken("||", new OperatorToken()));
      this.pushBase64GuidPredicate(newTokens, this);
      this.tokens = newTokens;
    }
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

  public convertBinaryPredicate(): TokenMap {
    return this;
  }

  public convertBooleanPredicate(): TokenMap {
    if (this.predicateType.isBooleanValue()) {
      // ToDo: check if better to change the existing array
      const newTokens: TaggedToken[] = [];

      this.tokens.forEach((taggedToken) => {
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
      this.tokens = newTokens;
    }
    return this;
  }

  public convertDatePredicate(): TokenMap {
    if (this.predicateType.isDateValue()) {
      // ToDo: check if better to change the existing array
      const newTokens: TaggedToken[] = [];

      this.tokens.forEach((taggedToken) => {
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
      this.tokens = newTokens;
    }
    return this;
  }

  /**
   * Converts a predicate for a Double value
   *
   * @param {TokenMap} taggedPredicate
   * @return {*}  {TokenMap}
   * @memberof TokenMap
   */
  public convertDoublePredicate(): TokenMap {
    if (this.predicateType.isDoubleValue()) {
      // ToDo: check if better to change the existing array
      const newTokens: TaggedToken[] = [];

      this.tokens.forEach((taggedToken) => {
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
      this.tokens = newTokens;
    }
    return this;
  }

  public convertIntegerPredicate(): TokenMap {
    if (this.predicateType.isIntegerValue()) {
      // ToDo: check if better to change the existing array
      const newTokens: TaggedToken[] = [];

      this.tokens.forEach((taggedToken) => {
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
      this.tokens = newTokens;
    }
    return this;
  }

  public convertLongPredicate(): TokenMap {
    if (this.predicateType.isLongValue()) {
      // ToDo: check if better to change the existing array
      const newTokens: TaggedToken[] = [];

      this.tokens.forEach((taggedToken) => {
        if (taggedToken.type.isValue()) {
          newTokens.push(
            new TaggedToken(
              taggedToken.token.substring(0, taggedToken.token.length - 1),
              new ValueToken()
            )
          );
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
      this.tokens = newTokens;
    }
    return this;
  }

  public convertStringPredicate(): TokenMap {
    if (this.predicateType.isStringValue()) {
      // ToDo: check if better to change the existing array
      const newTokens: TaggedToken[] = [];

      this.tokens.forEach((taggedToken) => {
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
      this.tokens = newTokens;
    }
    return this;
  }
}
