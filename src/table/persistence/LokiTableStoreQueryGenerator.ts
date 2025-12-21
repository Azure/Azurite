import StorageErrorFactory from "../errors/StorageErrorFactory";
import { Entity, Table } from "./ITableMetadataStore";
import Context from "../generated/Context";
import * as Models from "../generated/artifacts/models";
import parseQuery from "./QueryInterpreter/QueryParser";
import executeQuery from "./QueryInterpreter/QueryInterpreter";
import { validateQueryTree } from "./QueryInterpreter/QueryValidator";

/**
 * Handles Query Logic For LokiJs Table Implementation
 *
 * @export
 * @class LokiTableStoreQueryGenerator
 */
export default class LokiTableStoreQueryGenerator {
  /**
   * Will throw an exception on invalid query syntax
   *
   * @param queryOptions
   * @param context
   * @returns (entity: Entity) => boolean
   */
  public static generateQueryForPersistenceLayer(
    queryOptions: Models.QueryOptions,
    context: Context
  ): (entity: Entity) => boolean {
    let queryWhere;
    try {
      queryWhere =
        LokiTableStoreQueryGenerator.generateQueryEntityWhereFunction(
          queryOptions.filter
        );
    } catch (e) {
      throw StorageErrorFactory.getQueryConditionInvalid(context);
    }
    return queryWhere;
  }

  /**
   * Generates the table query function
   *
   * @static
   * @param {(string | undefined)} query
   * @return {*}  {(entity: Table) => boolean}
   * @memberof LokiTableStoreQueryGenerator
   */
  public static generateQueryTableWhereFunction(
    query: string | undefined
  ): (entity: Table) => boolean {
    if (query === undefined || query === "" || query === "true") {
      return () => true;
    }

    if (query === "false") {
      return () => false;
    }

    const queryTree = parseQuery(query);
    validateQueryTree(queryTree);
    return (entity) => executeQuery(entity, queryTree);
  }

  /**
   * generates a table query for the Loki Js table store
   *
   * @static
   * @param {string} query
   * @return {*}  {string}
   * @memberof LokiTableStoreQueryGenerator
   */
  public static transformTableQuery(query: string): string {
    const queryTree = parseQuery(query);
    return queryTree.toString();
  }

  /**
   * generates an entity query for the Loki Js table store
   *
   * @static
   * @param {(string | undefined)} query
   * @return {*}  {(entity: Entity) => boolean}
   * @memberof LokiTableStoreQueryGenerator
   */
  private static generateQueryEntityWhereFunction(
    query: string | undefined
  ): (entity: Entity) => boolean {
    if (query === undefined || query === "" || query === "true") {
      return () => true;
    }

    if (query === "false") {
      return () => false;
    }

    const queryTree = parseQuery(query);
    validateQueryTree(queryTree);
    return (entity) => executeQuery(entity, queryTree);
  }
}
