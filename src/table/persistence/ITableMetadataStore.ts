import Context from "../generated/Context";
import * as Models from "../generated/artifacts/models";

export default interface ITableMetadataStore {
  queryTable(): Promise<Models.TableResponseProperties[]>;
  createTable(tableName: string): Promise<number>; // Status code
  deleteTable(tableName: string): Promise<number>; // Status code
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
  ): Promise<number>; // Status Code
  mergeTableEntity(
    table: string,
    partitionKey: string,
    rowKey: string /* newEntity: */
  ): Promise<number>; // Status Code
  deleteTableEntity(
    table: string,
    partitionKey: string,
    rowKey: string
  ): Promise<number>; // Status code
  insertTableEntity(table: string /* newEntity: */): Promise<number>; // Status code
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
  init();
  close();
}
