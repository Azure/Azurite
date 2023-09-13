import { Entity, Table } from "../ITableMetadataStore";

export type IQueryContext = Entity | Table;

/**
 * Determines whether a given query context contains a table entity or not.
 * 
 * @param {IQueryContext} context The context which should be tested.
 * @returns {boolean}
 */
export function isEntity(context: IQueryContext): context is Entity {
  return (<Entity>context).hasOwnProperty('PartitionKey');
}

/**
 * Determines whether a given query context contains a table or not.
 * 
 * @param {IQueryContext} context 
 * @returns {boolean}
 */
export function isTable(context: IQueryContext): context is Table {
  return !!(<Table>context).table;
}