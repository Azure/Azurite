import Context from "../generated/Context";

export interface IOdataAnnotationsOptional {
  odatametadata?: string;
  odatatype?: string;
  odataid?: string;
  odataeditLink?: string;
}

interface ITable {
  account: string;
  table: string;
}

export type Table = ITable & IOdataAnnotationsOptional;

export interface IEntity {
  reqId: string;
  dbType: string;
  ts: string;
  operationName: string;
  statusCode: number;
  properties: {
    [propertyName: string]: string | number | boolean | null;
  };
}

export type Entity = IEntity & IOdataAnnotationsOptional;

export default interface IEventsMetadataStore {
  createTable(tableModel: Table): Promise<void>;
  getTable(account: string, table: string, context: Context): Promise<Table>;
  queryTableEntities(
    context: Context,
    account: string,
    table: string,
    nextPartitionKey?: string,
    nextRowKey?: string
  ): Promise<[Entity[], string | undefined, string | undefined]>;
  insertTableEntity(
    context: Context,
    table: string,
    account: string,
    entity: Entity,
  ): Promise<Entity>;
  init(): void;
  close(): void;
}
