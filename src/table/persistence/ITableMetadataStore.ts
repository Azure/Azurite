import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";

// Since the host name may change, we don't store host in {@code odatametadata, odatatid}
interface ITtableAdditionalProperties {
  tableAcl?: Models.SignedIdentifier[];
  account: string;
  tableName: string;
  odatametadata?: string;
  odatatype?: string;
  odataid?: string;
  odataeditLink?: string;
}

export interface IEntity {
  PartitionKey: string;
  RowKey: string;
  eTag: string;
  lastModifiedTime: Date;
  properties: {
    [propertyName: string]: string | number;
  };
}

export type TableModel = ITtableAdditionalProperties;

export default interface ITableMetadataStore {
  queryTable(context: Context): Promise<Models.TableResponseProperties[]>;
  createTable(context: Context, table: TableModel): Promise<void>;
  deleteTable(
    context: Context,
    tableName: string,
    accountName: string
  ): Promise<void>;
  queryTableEntities(
    context: Context,
    table: string,
    propertyName: Array<string>
  ): Promise<{ [propertyName: string]: any }[]>;
  queryTableEntitiesWithPartitionAndRowKey(
    context: Context,
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<{ [propertyName: string]: any }[]>;
  updateTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: IEntity,
    eatg: string
  ): Promise<void>;
  mergeTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: IEntity,
    etag: string,
    partitionKey: string,
    rowKey: string
  ): Promise<void>;
  deleteTableEntity(
    context: Context,
    tableName: string,
    accountName: string,
    partitionKey: string,
    rowKey: string,
    eatg: string
  ): Promise<void>;
  insertTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: IEntity
  ): Promise<void>;
  getTableAccessPolicy(
    context: Context,
    table: string,
    options: Models.TableGetAccessPolicyOptionalParams
  ): Promise<Models.TableGetAccessPolicyResponse>;
  setTableAccessPolicy(
    context: Context,
    table: string,
    options: Models.TableSetAccessPolicyOptionalParams
  ): Promise<Models.TableSetAccessPolicyResponse>;
  init(): void;
  close(): void;
}
