import IExtentStore from "../../common/persistence/IExtentStore";
import * as Models from "../generated/artifacts/models";
import Context from "../generated/Context";
import ILogger from "../generated/utils/ILogger";
import IBlobMetadataStore from "../persistence/IBlobMetadataStore";
import StorageErrorFactory from "../errors/StorageErrorFactory";
import { EMULATOR_ACCOUNT_ISHIERARCHICALNAMESPACEENABLED_DEFAULT } from "../utils/constants";
import {
  isHierarchicalNamespaceContainer,
  keepDfsInternalMetadata,
  removeDfsAclMetadata,
  removeDfsInternalMetadata
} from "../utils/utils";

/**
 * The kind of a Blob API write, for the DFS (ADLS Gen2) metadata of a
 * hierarchical namespace container. See BaseHandler.blobWriteMetadata.
 */
export enum BlobWriteKind {
  /** Creates a blob or replaces its content */
  Content,
  /** Creates or replaces a block blob without content */
  EmptyBlockBlob,
  /** Replaces the metadata of an existing blob */
  Metadata
}

/**
 * Whether blob metadata marks a DFS directory (hdi_isfolder, in any case).
 */
function isDirectoryMetadata(metadata: Models.BlobMetadata | undefined): boolean {
  const key = Object.keys(metadata || {}).find(k => k.toLowerCase() === "hdi_isfolder");
  return key !== undefined && metadata![key].toLowerCase() === "true";
}

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
    protected readonly loose: boolean,
    protected readonly hierarchicalNamespaceDefault: boolean = EMULATOR_ACCOUNT_ISHIERARCHICALNAMESPACEENABLED_DEFAULT
  ) {}

  /**
   * Whether a container has a hierarchical namespace, in which the DFS
   * (ADLS Gen2) metadata keys are internal. A missing container has none.
   */
  protected async isHierarchicalNamespaceContainer(
    context: Context,
    account: string,
    container: string
  ): Promise<boolean> {
    try {
      const properties = await this.metadataStore.getContainerProperties(context, account, container);
      return properties !== undefined && properties !== null &&
        isHierarchicalNamespaceContainer(properties.metadata, this.hierarchicalNamespaceDefault);
    } catch (error: any) {
      if (error?.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * The metadata of a blob returned by the Blob API: in a hierarchical
   * namespace container, without the DFS access control keys, which are
   * internal to the emulator.
   */
  protected async visibleBlobMetadata(
    context: Context,
    account: string,
    container: string,
    metadata: Models.BlobMetadata | undefined
  ): Promise<Models.BlobMetadata | undefined> {
    return (await this.isHierarchicalNamespaceContainer(context, account, container))
      ? removeDfsAclMetadata(metadata)
      : metadata;
  }

  /**
   * Compute the metadata of a Blob API write that creates a blob or replaces
   * the metadata of an existing one.
   *
   * In a hierarchical namespace container, the DFS (ADLS Gen2) directory marker
   * and access control state are stored as metadata, but are managed by the DFS
   * endpoint: an existing blob keeps their current values, and the values of
   * the request are ignored. Like with Azure, a new empty blob can be created as
   * a directory with `hdi_isfolder=true`, but never with access control keys.
   * In other containers, these keys are ordinary metadata.
   *
   * @protected
   * @param {Context} context
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {Models.BlobMetadata} [requestMetadata] Metadata of the request.
   * @param {BlobWriteKind} [kind=BlobWriteKind.Content] The kind of write:
   * - Content replaces the content of an existing blob, which fails on a
   *   directory with 409, as data can't be written to a directory;
   * - EmptyBlockBlob writes an empty block blob, which `hdi_isfolder=true`
   *   makes a directory when it creates the blob;
   * - Metadata only replaces the metadata of an existing blob.
   * @returns {(Promise<Models.BlobMetadata | undefined>)}
   * @memberof BaseHandler
   */
  protected async blobWriteMetadata(
    context: Context,
    account: string,
    container: string,
    blob: string,
    requestMetadata?: Models.BlobMetadata,
    kind: BlobWriteKind = BlobWriteKind.Content
  ): Promise<Models.BlobMetadata | undefined> {
    if (!(await this.isHierarchicalNamespaceContainer(context, account, container))) {
      return requestMetadata;
    }

    let currentMetadata: Models.BlobMetadata | undefined;
    let exists = false;
    try {
      currentMetadata = (
        await this.metadataStore.getBlobProperties(
          context, account, container, blob, undefined, undefined
        )
      ).metadata;
      exists = true;
    } catch (error: any) {
      // A missing container or blob: the write reports or creates it. Any
      // other failure must not be mistaken for a missing blob, which would
      // drop the DFS state of an existing path.
      if (error?.statusCode !== 404) {
        throw error;
      }
    }

    if (!exists) {
      if (kind !== BlobWriteKind.EmptyBlockBlob) {
        return removeDfsInternalMetadata(requestMetadata);
      }
      const metadata = removeDfsAclMetadata(requestMetadata);
      for (const key of Object.keys(metadata || {})) {
        if (key.toLowerCase() === "hdi_isfolder" && metadata![key].toLowerCase() !== "true") {
          delete metadata![key];
        }
      }
      return metadata;
    }

    if (kind === BlobWriteKind.Content && isDirectoryMetadata(currentMetadata)) {
      throw StorageErrorFactory.getOperationNotSupportedOnDirectory(context.contextId!);
    }
    return keepDfsInternalMetadata(requestMetadata, currentMetadata);
  }

  /**
   * Fails with 409 when a blob of a hierarchical namespace container is a
   * directory, e.g. before a copy replaces it with data.
   */
  protected async assertNotDirectory(
    context: Context,
    account: string,
    container: string,
    blob: string
  ): Promise<void> {
    try {
      const properties = await this.metadataStore.getBlobProperties(
        context, account, container, blob, undefined, undefined
      );
      if (isDirectoryMetadata(properties.metadata)) {
        throw StorageErrorFactory.getOperationNotSupportedOnDirectory(context.contextId!);
      }
    } catch (error: any) {
      if (error?.statusCode !== 404) {
        throw error;
      }
    }
  }
}
