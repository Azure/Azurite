import IAuthenticationContext from "../authentication/IAuthenticationContext";
import Context from "../generated/Context";

export default class BlobStorageContext extends Context
  implements IAuthenticationContext {
  public getContainer(): string | undefined {
    return this.context.container;
  }

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

  public get authenticationPath(): string | undefined {
    return this.context.authenticationPath;
  }

  public set authenticationPath(path: string | undefined) {
    this.context.authenticationPath = path;
  }

  public get xMsRequestID(): string | undefined {
    return this.contextId;
  }

  public set xMsRequestID(xMsRequestID: string | undefined) {
    this.contextId = xMsRequestID;
  }

  public get disableProductStyleUrl(): boolean | undefined {
    return this.context.disableProductStyleUrl;
  }

  public set disableProductStyleUrl(disableProductStyleUrl: boolean| undefined) {
    this.context.disableProductStyleUrl = disableProductStyleUrl;
  }

  public get loose(): boolean | undefined {
    return this.context.loose;
  }

  public set loose(loose: boolean| undefined) {
    this.context.loose = loose;
  }
}
