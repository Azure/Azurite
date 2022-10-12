import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import { TaggedToken, TokenType } from "./TokenMap";

export default class StateProcessIdentifier
  extends QPState
  implements IQPState
{
  name = QueryStateName.ProcessIdentifier;

  // process current query token which is identifier
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.determineNextToken(context);

    context = this.storeTaggedTokens(context, token);

    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

    return context;
  };

  // perform any post processing for state
  onExit = (context: QueryContext) => {
    return context;
  };

  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    const taggedToken: TaggedToken = [token, TokenType.Identifier];

    const taggedTokens = this.updateTaggedTokens(context, taggedToken);
    context = this.updateTaggedPredicate(taggedTokens, context);

    context.currentPos += token.length;

    return context;
  }
}
