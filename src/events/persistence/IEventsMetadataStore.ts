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
  operation: string;
  statusCode: number;
  outputLen?: number;
  inputLen?: number;
  properties: {
    [propertyName: string]: string | number | boolean | null;
  }; 
  [key: string]: any;
}

export type Entity = IEntity & IOdataAnnotationsOptional;

export default interface IEventsMetadataStore {
  createTable(tableModel: Table): Promise<void>;
  getTable(account: string, table: string): Promise<Table>;
  queryTableEntities(
    account: string,
    table: string
  ): Promise<Entity[]>;
  insertTableEntity(
    table: string,
    account: string,
    entity: Entity,
  ): Promise<Entity>;
  init(): void;
  close(): void;
}
