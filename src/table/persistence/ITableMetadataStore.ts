import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";

// Since the host name may change, we don't store host in {@code odatametadata, odatatid}
export interface IOdataAnnotations {
  odatametadata: string;
  odatatype: string;
  odataid: string;
  odataeditLink: string;
}

export interface IOdataAnnotationsOptional {
  odatametadata?: string;
  odatatype?: string;
  odataid?: string;
  odataeditLink?: string;
}

interface ITable {
  tableAcl?: Models.SignedIdentifier[];
  account: string;
  table: string;
}

export type Table = ITable & IOdataAnnotations;

export interface IEntity {
  PartitionKey: string;
  RowKey: string;
  eTag: string;
  lastModifiedTime: Date;
  properties: {
    [propertyName: string]: string | number;
  };
}

export type Entity = IEntity & IOdataAnnotations;

export default interface ITableMetadataStore {
  createTable(context: Context, table: Table): Promise<void>;
  queryTable(
    context: Context,
    accountName: string
  ): Promise<Models.TableResponseProperties[]>;
  deleteTable(
    context: Context,
    tableName: string,
    accountName: string
  ): Promise<void>;
  queryTableEntities(
    context: Context,
    accountName: string,
    table: string,
    queryOptions: Models.QueryOptions
  ): Promise<{ [propertyName: string]: any }[]>;
  queryTableEntitiesWithPartitionAndRowKey(
    context: Context,
    table: string,
    accountName: string,
    partitionKey: string,
    rowKey: string
  ): Promise<Entity>;
  updateTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: Entity,
    eatg: string
  ): Promise<void>;
  mergeTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: Entity,
    etag: string,
    partitionKey: string,
    rowKey: string
  ): Promise<string>;
  deleteTableEntity(
    context: Context,
    tableName: string,
    accountName: string,
    partitionKey: string,
    rowKey: string,
    etag: string
  ): Promise<void>;
  insertTableEntity(
    context: Context,
    tableName: string,
    account: string,
    entity: Entity
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
