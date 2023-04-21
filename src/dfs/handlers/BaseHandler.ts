import ILogger from "../../common/ILogger";
import IExtentStore from "../../common/persistence/IExtentStore";
import IDataLakeMetadataStore from "../persistence/IDataLakeMetadataStore";

/**
 * BaseHandler class should maintain a singleton to persistency layer, such as maintain a database connection pool.
 * So every inherited classes instances can reuse the persistency layer connection.
 *
 * @export
 * @class SimpleHandler
 * @implements {IHandler}
 */
export default class BaseHandler {
  constructor(
    protected readonly metadataStore: IDataLakeMetadataStore,
    protected readonly extentStore: IExtentStore,
    protected readonly logger: ILogger,
    protected readonly loose: boolean
  ) {}
}
