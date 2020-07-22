import ILogger from "../generated/utils/ILogger";
import ITableMetadataStore from "../persistence/ITableMetadataStore";

/**
 * BaseHandler class should maintain a singleton to persistency layer, such as maintain a database connection pool.
 * So every inherited classes instances can reuse the persistency layer connection.
 *
 * @export
 * @class BaseHandler
 * @implements {IHandler}
 */
export default class BaseHandler {
  constructor(
    protected readonly metadataStore: ITableMetadataStore,
    protected readonly logger: ILogger
  ) {}
}
