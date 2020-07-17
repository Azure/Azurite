import * as Models from "../generated/artifacts/models";
import ITableMetadataStore from "./ITableMetadataStore";

export default class LokiTableMetadataStore implements ITableMetadataStore {
  // private readonly db: Loki;

  public constructor(public readonly lokiDBPath: string) {
    // this.db = new Loki(lokiDBPath, {
    //   autosave: true,
    //   autosaveInterval: 5000
    // });
    // this.db.
  }

  public async queryTable(): Promise<Models.TableResponseProperties[]> {
    // TODO
    return undefined as any;
  }

  public async createTable(tableName: string): Promise<number> {
    // TODO
    return undefined as any;
  }

  public async deleteTable(tableName: string): Promise<number> {
    // TODO
    return undefined as any;
  }

  public async queryTableEntities(
    table: string,
    propertyName: Array<string>
  ): Promise<{ [propertyName: string]: any }[]> {
    // TODO
    return undefined as any;
  }

  public async queryTableEntitiesWithPartitionAndRowKey(
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<{ [propertyName: string]: any }[]> {
    // TODO
    return undefined as any;
  }

  public async updateTableEntity(
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<number> {
    // TODO
    return undefined as any;
  }

  public async mergeTableEntity(
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<number> {
    // TODO
    return undefined as any;
  }

  public async deleteTableEntity(
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<number> {
    // TODO
    return undefined as any;
  }

  public async insertTableEntity(table: string): Promise<number> {
    // TODO
    return undefined as any;
  }

  public async getTableAccessPolicy(
    table: string
  ): Promise<Models.TableGetAccessPolicyResponse> {
    // TODO
    return undefined as any;
  }

  public async setTableAccessPolicy(
    table: string
  ): Promise<Models.TableSetAccessPolicyResponse> {
    // TODO
    return undefined as any;
  }

  public async init() {}

  public async close() {}
}
