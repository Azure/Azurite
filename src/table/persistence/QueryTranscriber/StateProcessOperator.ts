import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import TaggedToken from "./TokenModel/TaggedToken";
import OperatorToken from "./TokenModel/OperatorToken";

export default class StateProcessOperator extends QPState implements IQPState {
  name = QueryStateName.ProcessOperator;

  /**
   * process current query token which is operator
   *
   * @param {QueryContext} context
   * @memberof StateProcessOperator
   */
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.determineNextToken(context);
    const originalTokenLength = token.length;
    token = StateProcessOperator.convertOperatorToken(token);
    context = this.storeTaggedTokens(context, token, originalTokenLength);

    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

    return context;
  };

  /**
   * optional post processing, here we can add logging
   * or additional validation etc
   *
   * @param {QueryContext} context
   * @memberof StateProcessValue
   */
  onExit = (context: QueryContext) => {
    return context;
  };

  /**
   * Converts a token from query request to a type used in persistence
   * layer query function.
   *
   * @private
   * @static
   * @param {string} token
   * @return {*}  {string}
   * @memberof LokiTableMetadataStore
   */
  private static convertOperatorToken(token: string): string {
    switch (token) {
      case "TableName":
        return "name";
      case "eq":
        return "===";
      case "gt":
        return ">";
      case "ge":
        return ">=";
      case "lt":
        return "<";
      case "le":
        return "<=";
      case "ne":
        return "!==";
      case "and":
        return "&&";
      case "or":
        return "||";
      case "not":
        return "!";
      default:
        return token;
    }
  }

  private storeTaggedTokens(
    context: QueryContext,
    token: string,
    originalTokenLength: number
  ): QueryContext {
    const taggedToken: TaggedToken = new TaggedToken(
      token,
      new OperatorToken()
    );

    const taggedTokens = this.updateTaggedTokens(context, taggedToken);
    context = this.updateTaggedPredicate(taggedTokens, context);

    context.currentPos += originalTokenLength;

    return context;
  }
}
