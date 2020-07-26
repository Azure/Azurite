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
}
