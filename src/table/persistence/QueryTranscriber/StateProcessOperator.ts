import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";

export default class StateProcessOperator extends QPState implements IQPState {
  name = QueryStateName.ProcessOperator;
  onProcess = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("Processing Operator");
    let token = "";
    [context, token] = this.determineNextToken(context);

    token = StateProcessOperator.convertOperatorToken(token);
    context.transcribedQuery += ` ${token}`;
    context.currentPos += token.length;

    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

    return context;
  };

  onExit = (context: QueryContext) => {
    // tslint:disable-next-line: no-console
    console.log("Processing Operator exit");

    // decide on next state
    // simple case fiorst with identifier, operator, value
    // context.stateQueue.push(QueryStateName.ProcessValue);
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
}
