import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import { TABLE_STATUSCODE } from "../utils/constants";

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
  createTable(context: Context, table: TableModel): Promise<TABLE_STATUSCODE>;
  deleteTable(context: Context, tableName: string): Promise<TABLE_STATUSCODE>;
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
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<TABLE_STATUSCODE>;
  mergeTableEntity(
    context: Context,
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<TABLE_STATUSCODE>;
  deleteTableEntity(
    context: Context,
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<TABLE_STATUSCODE>;
  insertTableEntity(
    context: Context,
    tableName: string,
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
