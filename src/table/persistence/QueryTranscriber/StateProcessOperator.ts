import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import { TaggedToken, TokenType } from "./TokenMap";

export default class StateProcessOperator extends QPState implements IQPState {
  name = QueryStateName.ProcessOperator;

  // process current query token which is operator
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.determineNextToken(context);

    token = StateProcessOperator.convertOperatorToken(token);
    context = this.storeTaggedTokens(context, token);

    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

    return context;
  };

  // perform optional post processing
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
    token: string
  ): QueryContext {
    const taggedToken: TaggedToken = [token, TokenType.Operator];

    const taggedTokens = this.updateTaggedTokens(context, taggedToken);
    context = this.updateTaggedPredicate(taggedTokens, context);

    context.currentPos += token.length;

    return context;
  }
}
