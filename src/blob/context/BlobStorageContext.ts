import Context from "../generated/Context";

export default class BlobStorageContext extends Context {
  public getContainer(): string | undefined {
    return this.context.container;
  }

  public get account(): string | undefined {
    return this.context.account;
  }

  public set account(account: string | undefined) {
    this.context.account = account;
  }

  public get container(): string | undefined {
    return this.context.container;
  }

  public set container(container: string | undefined) {
    this.context.container = container;
  }

  public get blob(): string | undefined {
    return this.context.blob;
  }

  public set blob(blob: string | undefined) {
    this.context.blob = blob;
  }

  public get xMsRequestID(): string | undefined {
    return this.contextID;
  }

  public set xMsRequestID(xMsRequestID: string | undefined) {
    this.contextID = xMsRequestID;
  }
}
