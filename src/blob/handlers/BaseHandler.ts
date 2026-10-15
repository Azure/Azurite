import IExtentStore from "../../common/persistence/IExtentStore";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import ILogger from "../generated/utils/ILogger";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import { keepDfsInternalMetadata, removeDfsAclMetadata } from "../utils/utils";

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
   * Compute the metadata of a Blob API write that creates a blob or replaces
   * the metadata of an existing one.
   *
   * The DFS (ADLS Gen2) directory marker and access control state are stored as
   * metadata, but are managed by the DFS endpoint: an existing blob keeps their
   * current values, and the values of the request are ignored. A new blob can
   * be created as a directory with `hdi_isfolder`, like with Azure, but never
   * with access control keys.
   *
   * @protected
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.BlobMetadata} [requestMetadata] Metadata of the request.
   * @returns {(Promise<Models.BlobMetadata | undefined>)}
   * @memberof BaseHandler
   */
  protected async blobWriteMetadata(
    context: Context,
    account: string,
    container: string,
    blob: string,
    requestMetadata?: Models.BlobMetadata
  ): Promise<Models.BlobMetadata | undefined> {
    let currentMetadata: Models.BlobMetadata | undefined;
    let exists = false;
    try {
      currentMetadata = (
        await this.metadataStore.getBlobProperties(
          context, account, container, blob, undefined, undefined
        )
      ).metadata;
      exists = true;
    } catch {
      // A missing container or blob: the write reports or creates it.
    }

    if (!exists) {
      return removeDfsAclMetadata(requestMetadata);
    }

    return keepDfsInternalMetadata(requestMetadata, currentMetadata);
  }
}
