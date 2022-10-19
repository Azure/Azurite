import IQPState from "./IQPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import TaggedToken from "./TaggedToken";
import { TokenMap } from "./TokenMap";
import IdentifierToken from "./TokenModel/IdentifierToken";
import OperatorToken from "./TokenModel/OperatorToken";
import ParensCloseToken from "./TokenModel/ParensCloseToken";
import ParensOpenToken from "./TokenModel/ParensOpenToken";
import ValueToken from "./TokenModel/ValueToken";
// import { TokenType } from "./TokenType";

export default class StateQueryFinished implements IQPState {
  name = QueryStateName.QueryFinished;

  // completes query transcribing
  onProcess = (context: QueryContext) => {
    // add tagged predicates to the query output, then close the query function
    // this is where we add support for backwards compatability in the schema
    // and do conversions for special types etc and their DB schema representation
    for (const taggedPredicate of context.taggedPredicates) {
      let predicate = "";
      if (taggedPredicate !== undefined) {
        const convertedPredicate =
          this.convertPredicateForLokiJS(taggedPredicate);
        for (const taggedPredicateToken of convertedPredicate.tokens) {
          predicate += " ";
          predicate += taggedPredicateToken.token;
        }
      }

      context.transcribedQuery += predicate;
    }
    // Close off query function:
    context.transcribedQuery += " )";
    return context;
  };

  onExit = (context: QueryContext) => {
    // Log converted query?
    return context;
  };

  convertPredicateForLokiJS(taggedPredicate: TokenMap): TokenMap {
    let convertedPredicate: TokenMap;
    convertedPredicate = this.convertGuidPredicate(taggedPredicate);
    return convertedPredicate;
  }

  /**
   * adds additional "OR" clause predicate in the form:
   * ( <original predicate> || <backwards compatible predicate>)
   *
   * @param {TokenMap} taggedPredicate
   * @return {*}  {TokenMap}
   * @memberof StateQueryFinished
   */
  convertGuidPredicate(taggedPredicate: TokenMap): TokenMap {
    if (taggedPredicate.predicateType.isGuidValue()) {
      const newTokens: TaggedToken[] = [];
      this.pushStringGuidPredicate(newTokens, taggedPredicate);
      newTokens.push(new TaggedToken("||", new OperatorToken()));
      this.pushBase64GuidPredicate(newTokens, taggedPredicate);
      taggedPredicate.tokens = newTokens;
    }
    return taggedPredicate;
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
}
