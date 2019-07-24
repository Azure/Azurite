import { IDataStore } from "../../common/IDataStore";
import * as Models from "../generated/artifacts/models";

/**
 * This model describes a chunk inside a persistency extent for a given extent ID.
 * A chunk points to a sub-range of an extent.
 *
 * @export
 * @interface IPersistencyChunk
 */
export interface IPersistencyChunk {
  id: string; // The persistency layer storage extent ID where the chunk belongs to
  offset: number; // Chunk offset inside the extent where chunk starts in bytes
  count: number; // Chunk length in bytes
}

export const ZERO_PERSISTENCY_CHUNK_ID = "*ZERO*";

/** MODELS FOR SERVICE */
interface IServiceAdditionalProperties {
  accountName: string;
}

export type ServicePropertiesModel = Models.StorageServiceProperties &
  IServiceAdditionalProperties;

/** MODELS FOR CONTAINER */
interface IContainerAdditionalProperties {
  accountName: string;
  leaseduration?: number;
  leaseId?: string;
  leaseExpireTime?: Date;
  leaseBreakExpireTime?: Date;
  containerAcl?: Models.SignedIdentifier[];
}

export type ContainerModel = Models.ContainerItem &
  IContainerAdditionalProperties;

/** MODELS FOR BLOBS */
interface IPersistencyPropertiesRequired {
  /**
   * A reference to persistency layer chunk of data.
   *
   * @type {IPersistencyChunk}
   * @memberof IPersistencyProperties
   */
  persistency: IPersistencyChunk;
}

interface IPersistencyPropertiesOptional {
  /**
   * A reference to persistency layer chunk of data.
   *
   * @type {IPersistencyChunk}
   * @memberof IPersistencyProperties
   */
  persistency?: IPersistencyChunk;
}

interface IBlockBlobAdditionalProperties {
  /**
   * False for uncommitted block blob, otherwise true.
   *
   * @type {boolean}
   * @memberof IBlobAdditionalProperties
   */
  isCommitted: boolean;
  leaseduration?: number;
  leaseId?: string;
  leaseExpireTime?: Date;
  leaseBreakExpireTime?: Date;

  /**
   * Committed blocks for block blob.
   *
   * @type {PersistencyBlockModel[]}
   * @memberof IBlobAdditionalProperties
   */
  committedBlocksInOrder?: PersistencyBlockModel[];
}

/**
 * PageRange model with pointers to persistency chunk.
 */
export type PersistencyPageRange = IPersistencyPropertiesRequired &
  Models.PageRange;

interface IPageBlobAdditionalProperties {
  pageRangesInOrder?: PersistencyPageRange[];
}

interface IBlobAdditionalProperties {
  accountName: string;
  containerName: string;
}

export type BlobModel = IBlobAdditionalProperties &
  IPageBlobAdditionalProperties &
  IBlockBlobAdditionalProperties &
  Models.BlobItem &
  IPersistencyPropertiesOptional;

/** MODELS FOR BLOCKS */
interface IBlockAdditionalProperties {
  accountName: string;
  containerName: string;
  blobName: string;
  isCommitted: boolean;
}

type PersistencyBlockModel = Models.Block & IPersistencyPropertiesRequired;

export type BlockModel = IBlockAdditionalProperties & PersistencyBlockModel;

/**
 * Persistency layer data store interface.
 *
 * @export
 * @interface IBlobDataStore
 * @extends {IDataStore}
 */
export interface IBlobMetadataStore extends IDataStore {
  /**
   * Update blob service properties. Create service properties document if not exists in persistency layer.
   * Assume service properties collection has been created during start method.
   *
   * @template T
   * @param {T} serviceProperties
   * @returns {Promise<T>}
   * @memberof IBlobMetadataStore
   */
  updateServiceProperties<T extends ServicePropertiesModel>(
    serviceProperties: T
  ): Promise<T>;

  /**
   * Get service properties for specific storage account.
   *
   * @param {string} account
   * @returns {Promise<undefined>}
   * @memberof IBlobMetadataStore
   */
  getServiceProperties(
    account: string
  ): Promise<ServicePropertiesModel | undefined>;

  /**
   * Get a container item from persistency layer by account and container name.
   *
   * @param {string} account
   * @param {string} container
   * @returns {(Promise<ContainerModel | undefined>)}
   * @memberof IBlobMetadataStore
   */
  getContainer(
    account: string,
    container: string
  ): Promise<ContainerModel | undefined>;

  /**
   * Delete container item if exists from persistency layer.
   * Note that this method will only remove container related document from persistency layer.
   * Make sure blobs under the container has been properly handled before calling this method.
   *
   * @param {string} account
   * @param {string} container
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  deleteContainer(account: string, container: string): Promise<void>;

  /**
   * Create a container item in persistency layer.
   *
   * @param {ContainerModel} container
   * @returns {Promise<ContainerModel>}
   * @memberof IBlobMetadataStore
   */
  createContainer(container: ContainerModel): Promise<ContainerModel>;

  /**
   * Update a container item in persistency layer.
   *
   * @template T
   * @param {T} container
   * @returns {Promise<T>}
   * @memberof IBlobMetadataStore
   */
  setContainerMetadata<T extends ContainerModel>(container: T): Promise<T>;

  /**
   * List containers with query conditions specified.
   *
   * @param {string} account
   * @param {string} [prefix]
   * @param {number} [maxResults]
   * @param {number} [marker]
   * @returns {(Promise<[ContainerModel[], number | undefined]>)} A tuple including containers and next marker
   * @memberof IBlobMetadataStore
   */
  listContainers(
    account: string,
    prefix?: string,
    maxResults?: number,
    marker?: number
  ): Promise<[ContainerModel[], number | undefined]>;

  deleteBlobs(account: string, container: string): Promise<void>;

  /**
   * Update blob item in persistency layer. Will create if blob doesn't exist.
   *
   * @template T
   * @param {T} blob
   * @returns {Promise<T>}
   * @memberof IBlobMetadataStore
   */
  updateBlob<T extends BlobModel>(blob: T): Promise<T>;

  /**
   * Gets a blob item from persistency layer by container name and blob name.
   *
   * @template T
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @returns {(Promise<T | undefined>)}
   * @memberof IBlobMetadataStore
   */
  getBlob<T extends BlobModel>(
    account: string,
    container: string,
    blob: string,
    snapshot?: string
  ): Promise<T | undefined>;

  /**
   * List blobs with query conditions specified.
   *
   * @template T
   * @param {string} [account]
   * @param {string} [container]
   * @param {string} [blob]
   * @param {string} [prefix]
   * @param {number} [maxResults]
   * @param {number} [marker]
   * @param {boolean} [includeSnapshots]
   * @returns {(Promise<[T[], number | undefined]>)} A tuple including list blobs and next marker.
   * @memberof IBlobMetadataStore
   */
  listBlobs<T extends BlobModel>(
    account?: string,
    container?: string,
    blob?: string,
    prefix?: string,
    maxResults?: number,
    marker?: number,
    includeSnapshots?: boolean
  ): Promise<[T[], number | undefined]>;

  /**
   * Delete blob item from persistency layer.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  deleteBlob(
    account: string,
    container: string,
    blob: string,
    snapshot?: string
  ): Promise<void>;

  /**
   * Update blob block item in persistency layer. Will create if block doesn't exist.
   *
   * @template T
   * @param {T} block
   * @returns {Promise<T>}
   * @memberof IBlobMetadataStore
   */
  updateBlock<T extends BlockModel>(block: T): Promise<T>;

  /**
   * Delete all blocks for a blob in persistency layer.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  deleteBlocks(account: string, container: string, blob: string): Promise<void>;

  /**
   * Insert blocks for a blob in persistency layer. Existing blocks with same name will be replaced.
   *
   * @template T
   * @param {T[]} blocks
   * @returns {Promise<T[]>}
   * @memberof IBlobMetadataStore
   */
  insertBlocks<T extends BlockModel>(blocks: T[]): Promise<T[]>;

  /**
   * Gets block for a blob from persistency layer by account, container, blob and block names.
   *
   * @template T
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} block
   * @param {boolean} isCommitted
   * @returns {Promise<T | undefined>}
   * @memberof LokiBlobDataStore
   */
  getBlock<T extends BlockModel>(
    account: string,
    container: string,
    blob: string,
    block: string,
    isCommitted: boolean
  ): Promise<T | undefined>;

  /**
   * Gets blocks list for a blob from persistency layer by account, container and blob names.
   *
   * @template T
   * @param {string} [account]
   * @param {string} [container]
   * @param {string} [blob]
   * @param {boolean} [isCommitted]
   * @returns {(Promise<T[]>)}
   * @memberof IBlobMetadataStore
   */
  listBlocks<T extends BlockModel>(
    account?: string,
    container?: string,
    blob?: string,
    isCommitted?: boolean
  ): Promise<T[]>;
}

export default IBlobMetadataStore;
