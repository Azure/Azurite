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

export type PersistencyBlockModel = Models.Block &
  IPersistencyPropertiesRequired;

export type BlockModel = IBlockAdditionalProperties & PersistencyBlockModel;

/**
 * Persistency layer metadata storage interface.
 *
 * TODO: Integrate cache layer to cache account, container & blob metadata.
 *
 * @export
 * @interface IBlobDataStore
 * @extends {IDataStore}
 */
export interface IBlobMetadataStore extends IDataStore {
  /**
   * Update blob service properties. Create service properties if not exists in persistency layer.
   *
   * TODO: Account's service property should be created when storage account is created or metadata
   * storage initialization. This method should only be responsible for updating existing record.
   * In this way, we can reduce one I/O call to get account properties.
   *
   * @param {ServicePropertiesModel} serviceProperties
   * @returns {Promise<ServicePropertiesModel>} undefined properties will be ignored during properties setup
   * @memberof IBlobMetadataStore
   */
  setServiceProperties(
    serviceProperties: ServicePropertiesModel
  ): Promise<ServicePropertiesModel>;

  /**
   * Get service properties for specific storage account.
   *
   * @param {string} account
   * @returns {Promise<ServicePropertiesModel | undefined>}
   * @memberof IBlobMetadataStore
   */
  getServiceProperties(
    account: string
  ): Promise<ServicePropertiesModel | undefined>;

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

  /**
   * Create a container.
   *
   * @param {ContainerModel} container
   * @returns {Promise<ContainerModel>}
   * @memberof IBlobMetadataStore
   */
  createContainer(container: ContainerModel): Promise<ContainerModel>;

  /**
   * Get a container properties.
   *
   * @param {string} account
   * @param {string} container
   * @returns {(Promise<ContainerModel | undefined>)}
   * @memberof IBlobMetadataStore
   */
  getContainerProperties(
    account: string,
    container: string
  ): Promise<ContainerModel | undefined>;

  /**
   * Delete container item if exists from persistency layer.
   * Note that this method will mark the specific container with "deleting" tag. Container item
   * will be removed only if all blobs under that container has been removed with GC. During
   * "deleting" status, container and blobs under that container cannot be accessed.
   *
   * TODO: Make sure all metadata interface implementation follow up above assumption.
   * TODO: GC for async container deletion.
   *
   * @param {string} account
   * @param {string} container
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  deleteContainer(account: string, container: string): Promise<void>;

  /**
   * Set container metadata.
   *
   * @param {ContainerModel} container
   * @returns {Promise<ContainerModel>}
   * @memberof IBlobMetadataStore
   */
  setContainerMetadata(container: ContainerModel): Promise<ContainerModel>;

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
  listBlobs(
    account?: string,
    container?: string,
    blob?: string,
    prefix?: string,
    maxResults?: number,
    marker?: number,
    includeSnapshots?: boolean
  ): Promise<[BlobModel[], number | undefined]>;

  /**
   * Create blob item in persistency layer. Will replace if blob exists.
   *
   * @param {BlobModel} blob
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  createBlob(blob: BlobModel): Promise<void>;

  /**
   * Gets a blob item from persistency layer by container name and blob name.
   * Will return block list or page list as well for downloading.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @returns {(Promise<BlobModel | undefined>)}
   * @memberof IBlobMetadataStore
   */
  downloadBlob(
    account: string,
    container: string,
    blob: string,
    snapshot?: string
  ): Promise<BlobModel | undefined>;

  /**
   * Get blob properties and metadata without block list or page range list.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {string} [snapshot]
   * @returns {(Promise<BlobModel | undefined>)}
   * @memberof IBlobMetadataStore
   */
  getBlobProperties(
    account: string,
    container: string,
    blob: string,
    snapshot?: string
  ): Promise<BlobModel | undefined>;

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
   * Set blob HTTP headers.
   *
   * @param {BlobModel} blob
   * @returns {Promise<BlobModel>}
   * @memberof IBlobMetadataStore
   */
  setBlobHTTPHeaders(blob: BlobModel): Promise<BlobModel>;

  /**
   * Set blob metadata.
   *
   * @param {BlobModel} blob
   * @returns {Promise<BlobModel>}
   * @memberof IBlobMetadataStore
   */
  setBlobMetadata(blob: BlobModel): Promise<BlobModel>;

  /**
   * Update blob block item in persistency layer. Will create if block doesn't exist.
   * TODO: Will also create a uncommitted block blob.
   *
   * @param {BlockModel} block
   * @param {BlobModel} [blob]
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  stageBlock(block: BlockModel, blob?: BlobModel): Promise<void>;

  /**
   * Commit block list for a blob.
   *
   * @param {BlobModel} blob
   * @param {{ blockName: string; blockCommitType: string }[]} blockList
   * @returns {Promise<void>}
   * @memberof IBlobMetadataStore
   */
  commitBlockList(
    blob: BlobModel,
    blockList: { blockName: string; blockCommitType: string }[]
  ): Promise<void>;

  /**
   * Gets blocks list for a blob from persistency layer by account, container and blob names.
   *
   * @param {string} [account]
   * @param {string} [container]
   * @param {string} [blob]
   * @param {boolean} [isCommitted]
   * @returns {(Promise<BlockModel[]>)}
   * @memberof IBlobMetadataStore
   */
  getBlockList(
    account: string,
    container: string,
    blob: string,
    isCommitted?: boolean
  ): Promise<{
    uncommittedBlocks: Models.Block[];
    committedBlocks: Models.Block[];
  }>;
}

export default IBlobMetadataStore;
