import Context from "../generated/Context";

export default class TableStorageContext extends Context {
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

  public get xMsRequestID(): string | undefined {
    return this.contextID;
  }

  public set xMsRequestID(xMsRequestID: string | undefined) {
    this.contextID = xMsRequestID;
  }
}
