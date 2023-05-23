import { Entity, Table } from "../ITableMetadataStore";

export type IQueryContext = Entity | Table;

export function isEntity(context: IQueryContext): context is Entity {
  return !!(<Entity>context).PartitionKey
}

export function isTable(context: IQueryContext): context is Table {
  return !!(<Table>context).table
}