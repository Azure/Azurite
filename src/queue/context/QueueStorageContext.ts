import IAuthenticationContext from "../authentication/IAuthenticationContext";
import Context from "../generated/Context";

export default class QueueStorageContext extends Context
  implements IAuthenticationContext {
  public get account(): string | undefined {
    return this.context.account;
  }

  public set account(account: string | undefined) {
    this.context.account = account;
  }

  public set isSecondary(isSecondary: boolean | undefined) {
    this.context.isSecondary = isSecondary;
  }

  public get isSecondary(): boolean | undefined {
    return this.context.isSecondary;
  }

  public get queue(): string | undefined {
    return this.context.queue;
  }

  public set queue(queue: string | undefined) {
    this.context.queue = queue;
  }

  public get message(): string | undefined {
    return this.context.message;
  }

  public set message(message: string | undefined) {
    this.context.message = message;
  }

  public get messageId(): string | undefined {
    return this.context.messageId;
  }

  public set messageId(messageId: string | undefined) {
    this.context.messageId = messageId;
  }

  public get authenticationPath(): string | undefined {
    return this.context.authenticationPath;
  }

  public set authenticationPath(path: string | undefined) {
    this.context.authenticationPath = path;
  }

  public get xMsRequestID(): string | undefined {
    return this.contextID;
  }

  public set xMsRequestID(xMsRequestID: string | undefined) {
    this.contextID = xMsRequestID;
  }
}
