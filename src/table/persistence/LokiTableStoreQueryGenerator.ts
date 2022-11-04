import StorageErrorFactory from "../errors/StorageErrorFactory";
import { Entity, Table } from "./ITableMetadataStore";
import Context from "../generated/Context";
import * as Models from "../generated/artifacts/models";
import LokiJsQueryTranscriberFactory from "./QueryTranscriber/LokiJsQueryTranscriberFactory";

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
   * @returns
   */
  public static generateQueryForPersistenceLayer(
    queryOptions: Models.QueryOptions,
    context: Context
  ) {
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
    if (query === undefined) {
      return () => true;
    }

    const transformedQuery =
      LokiTableStoreQueryGenerator.transformTableQuery(query);

    return new Function("item", transformedQuery) as any;
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
    const queryTranscriber =
      LokiJsQueryTranscriberFactory.createTableQueryTranscriber(
        query,
        "lokiJsTableQueryTranscriber"
      );

    queryTranscriber.transcribe();

    return queryTranscriber.getTranscribedQuery();
  }

  /**
   * generates an entity query for the Loki Js table store
   *
   * @static
   * @param {(string | undefined)} query
   * @return {*}  {(entity: Entity) => boolean}
   * @memberof LokiTableStoreQueryGenerator
   */
  public static generateQueryEntityWhereFunction(
    query: string | undefined
  ): (entity: Entity) => boolean {
    if (query === undefined) {
      return () => true;
    }

    const queryTranscriber =
      LokiJsQueryTranscriberFactory.createEntityQueryTranscriber(
        query,
        "lokiJsQueryTranscriber"
      );

    queryTranscriber.transcribe();

    return new Function("item", queryTranscriber.getTranscribedQuery()) as any;
  }
}
