import IQPState from "./IQPState";
import QPState from "./QPState";
import QueryContext from "./QueryContext";
import { QueryStateName } from "./QueryStateName";
import TaggedToken from "./TaggedToken";
import ValueToken from "./TokenModel/ValueToken";

export default class StateProcessValue extends QPState implements IQPState {
  name = QueryStateName.ProcessValue;

  // process current query token which is operator
  onProcess = (context: QueryContext) => {
    let token = "";
    [context, token] = this.determineNextToken(context);

    context = this.storeTaggedTokens(context, token);

    [context, token] = this.determineNextToken(context);
    context = this.handleToken(context, token);

    return context;
  };

  // optional post processing
  onExit = (context: QueryContext) => {
    return context;
  };

  private storeTaggedTokens(
    context: QueryContext,
    token: string
  ): QueryContext {
    const taggedToken: TaggedToken = new TaggedToken(token, new ValueToken());

    const taggedTokens = this.updateTaggedTokens(context, taggedToken);
    context = this.updateTaggedPredicate(taggedTokens, context);

    context.currentPos += token.length;

    return context;
  }
}
