import ICleaner from "../../common/ICleaner";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
/** MODELS FOR SERVICE */
interface IServiceAdditionalProperties {
  accountName: string;
}

export type ServicePropertiesModel = Models.TableServiceProperties &
  IServiceAdditionalProperties;

// Since the host name may change, we don't store host in {@code odatametadata, odataid}
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

export type Table = ITable & IOdataAnnotationsOptional;

export type TableACL = Models.SignedIdentifier[];

export interface IEntity {
  PartitionKey: string;
  RowKey: string;
  eTag: string;
  lastModifiedTime: string;
  properties: {
    [propertyName: string]: string | number | boolean | null;
  };
}

export type Entity = IEntity & IOdataAnnotationsOptional;

export default interface ITableMetadataStore extends ICleaner {
  createTable(context: Context, tableModel: Table): Promise<void>;
  queryTable(
    context: Context,
    account: string,
    queryOptions: Models.QueryOptions,
    nextTable?: string
  ): Promise<[Table[], string | undefined]>;
  deleteTable(context: Context, table: string, account: string): Promise<void>;
  setTableACL(
    account: string,
    table: string,
    context: Context,
    queueACL?: TableACL
  ): Promise<void>;
  getTable(account: string, table: string, context: Context): Promise<Table>;
  queryTableEntities(
    context: Context,
    account: string,
    table: string,
    queryOptions: Models.QueryOptions,
    nextPartitionKey?: string,
    nextRowKey?: string
  ): Promise<[Entity[], string | undefined, string | undefined]>;
  queryTableEntitiesWithPartitionAndRowKey(
    context: Context,
    table: string,
    account: string,
    partitionKey: string,
    rowKey: string,
    batchID?: string
  ): Promise<Entity | undefined>;
  insertOrUpdateTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
    ifMatch?: string,
    batchID?: string
  ): Promise<Entity>;
  insertOrMergeTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
    ifMatch?: string,
    batchID?: string
  ): Promise<Entity>;
  deleteTableEntity(
    context: Context,
    table: string,
    account: string,
    partitionKey: string,
    rowKey: string,
    etag: string,
    batchID?: string
  ): Promise<void>;
  insertTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
    batchID?: string
  ): Promise<Entity>;
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
  getServiceProperties(
    context: Context,
    account: string
  ): Promise<ServicePropertiesModel | undefined>;
  setServiceProperties(
    context: Context,
    serviceProperties: ServicePropertiesModel
  ): Promise<ServicePropertiesModel>;
  beginBatchTransaction(batchID: string): Promise<void>;
  endBatchTransaction(
    account: string,
    table: string,
    batchID: string,
    context: Context,
    succeeded: boolean
  ): Promise<void>;
}
