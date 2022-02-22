import Context from "../generated/Context";
import IRequest from "../generated/IRequest";
import IResponse from "../generated/IResponse";

export default class TableStorageContext extends Context {
  private _batchId: string = "";

  constructor(
    holderOrContext: object | Context,
    path: string = "context",
    req?: IRequest,
    res?: IResponse
  ) {
    super(holderOrContext, path, req, res);
    if (
      (holderOrContext as TableStorageContext).batchId !== undefined &&
      (holderOrContext as TableStorageContext).batchId !== ""
    ) {
      this._batchId = (holderOrContext as TableStorageContext).batchId;
    }
  }

  public get account(): string | undefined {
    return this.context.account;
  }

  public set account(account: string | undefined) {
    this.context.account = account;
  }

  public get tableName(): string | undefined {
    return this.context.tableName;
  }

  public set tableName(tableName: string | undefined) {
    this.context.tableName = tableName;
  }

  public get authenticationPath(): string | undefined {
    return this.context.authenticationPath;
  }

  public set authenticationPath(path: string | undefined) {
    this.context.authenticationPath = path;
  }

  public get partitionKey(): string | undefined {
    return this.context.partitionKey;
  }

  public set partitionKey(partitionKey: string | undefined) {
    this.context.partitionKey = partitionKey;
  }

  public get rowKey(): string | undefined {
    return this.context.rowKey;
  }

  public set rowKey(rowKey: string | undefined) {
    this.context.rowKey = rowKey;
  }

  public get xMsRequestID(): string | undefined {
    return this.contextID;
  }

  public set xMsRequestID(xMsRequestID: string | undefined) {
    this.contextID = xMsRequestID;
  }

  public get accept(): string | undefined {
    return this.context.accept;
  }

  public set accept(accept: string | undefined) {
    this.context.accept = accept;
  }

  public set isSecondary(isSecondary: boolean | undefined) {
    this.context.isSecondary = isSecondary;
  }

  public get isSecondary(): boolean | undefined {
    return this.context.isSecondary;
  }
  // used for entity group transactions / batch processing
  public set batchId(id: string) {
    this._batchId = id;
  }

  public get batchId(): string {
    return this._batchId;
  }
}
