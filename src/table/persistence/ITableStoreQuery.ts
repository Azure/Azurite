import { QueryOptions } from "../generated/artifacts/models";
import Context from "../generated/Context";
import { Table } from "./ITableMetadataStore";

export default interface ITableStoreQuery {
  generateQueryTableWhereFunction(
    query: string | undefined
  ): (entity: Table) => boolean;
  generateQueryForPersistenceLayer(
    queryOptions: QueryOptions,
    context: Context
  ): any;
}
