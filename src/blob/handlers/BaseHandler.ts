import IExtentStore from "../../common/persistence/IExtentStore";
import ILogger from "../generated/utils/ILogger";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import { validateSnapshotAndVersionId } from "../utils/utils";

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
    protected readonly metadataStore: IBlobMetadataStore,
    protected readonly extentStore: IExtentStore,
    protected readonly logger: ILogger,
    protected readonly loose: boolean
  ) {}

  /**
   * Validate the `snapshot` and `versionId` query parameters of a blob request, and return
   * the version ID the request should be served with.
   *
   * A request may address a snapshot or a version, but not both, and a version ID must be
   * an RFC 3339 timestamp with 7 digit fractional seconds. Azure Storage rejects either
   * mistake with 400, which is what strict mode does.
   *
   * Loose mode ignores parameters Azurite would otherwise reject, so the offending version
   * ID is dropped and the request is served against the current version - the behaviour
   * loose mode had before versioning existed, when `versionid` was ignored entirely.
   * Returning the value rather than only validating it keeps those two outcomes in one
   * place, so a caller cannot skip the error and then act on the bad input.
   *
   * @protected
   * @param {string} [snapshot]
   * @param {string} [versionId]
   * @param {string} [contextId]
   * @returns {(string | undefined)}
   * @memberof BaseHandler
   */
  protected resolveVersionId(
    snapshot?: string,
    versionId?: string,
    contextId?: string
  ): string | undefined {
    try {
      validateSnapshotAndVersionId(snapshot, versionId, contextId);
      return versionId;
    } catch (err) {
      if (this.loose) {
        this.logger.warn(
          `BaseHandler:resolveVersionId() Ignoring versionid in loose mode: snapshot=${snapshot}, versionid=${versionId}`,
          contextId
        );
        return undefined;
      }
      throw err;
    }
  }
}
