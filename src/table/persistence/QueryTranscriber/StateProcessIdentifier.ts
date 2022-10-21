import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import TaggedToken from "./TokenModel/TaggedToken";
import IdentifierToken from "./TokenModel/IdentifierToken";

export default class StateProcessIdentifier
  extends QPState
  implements IQPState
{
  name = QueryStateName.ProcessIdentifier;

  /**
   * process current token which is an identifier
   *
   * @param {QueryContext} context
   * @memberof StateProcessIdentifier
   */
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.determineNextToken(context);

    context = this.storeTaggedTokens(context, token);

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

  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    const taggedToken: TaggedToken = new TaggedToken(
      token,
      new IdentifierToken()
    );

    const taggedTokens = this.updateTaggedTokens(context, taggedToken);
    context = this.updateTaggedPredicate(taggedTokens, context);

    context.currentPos += token.length;

    return context;
  }
}
