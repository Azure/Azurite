// tslint:disable:ordered-imports
import IServiceHandler from "./IServiceHandler";
import IQueueHandler from "./IQueueHandler";
import IMessagesHandler from "./IMessagesHandler";
import IMessageIdHandler from "./IMessageIdHandler";

export interface IHandlers {
  serviceHandler: IServiceHandler;
  queueHandler: IQueueHandler;
  messagesHandler: IMessagesHandler;
  messageIdHandler: IMessageIdHandler;
}
export default IHandlers;
