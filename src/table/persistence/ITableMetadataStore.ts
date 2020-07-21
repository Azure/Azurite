import Context from "../generated/Context";
import * as Models from "../generated/artifacts/models";
import { TABLE_STATUSCODE } from "../utils/constants";

interface ITtableAdditionalProperties {
  tableAcl?: Models.SignedIdentifier[];
  account: string;
  name: string;
}

export type TableModel = ITtableAdditionalProperties;

export default interface ITableMetadataStore {
  queryTable(): Promise<Models.TableResponseProperties[]>;
  createTable(table: TableModel, context: Context): Promise<TABLE_STATUSCODE>; // Status code
  deleteTable(tableName: string): Promise<TABLE_STATUSCODE>; // Status code
  queryTableEntities(
    table: string,
    propertyName: Array<string>
  ): Promise<{ [propertyName: string]: any }[]>;
  queryTableEntitiesWithPartitionAndRowKey(
    table: string,
    partitionKey: string,
    rowKey: string /* newEntity: {[propertyName: string]}[] */
  ): Promise<{ [propertyName: string]: any }[]>;
  updateTableEntity(
    table: string,
    partitionKey: string,
    rowKey: string /* newEntity: */
  ): Promise<TABLE_STATUSCODE>; // Status Code
  mergeTableEntity(
    table: string,
    partitionKey: string,
    rowKey: string /* newEntity: */
  ): Promise<TABLE_STATUSCODE>; // Status Code
  deleteTableEntity(
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<TABLE_STATUSCODE>; // Status code
  insertTableEntity(table: string /* newEntity: */): Promise<TABLE_STATUSCODE>; // Status code
  getTableAccessPolicy(
    table: string,
    options: Models.TableGetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.TableGetAccessPolicyResponse>;
  setTableAccessPolicy(
    table: string,
    options: Models.TableSetAccessPolicyOptionalParams,
    context: Context
  ): Promise<Models.TableSetAccessPolicyResponse>;
  init(): void;
  close(): void;
}
