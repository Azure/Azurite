import { IDataStore } from "../../common/IDataStore";
import * as Models from "../generated/artifacts/models";

/** MODELS FOR SERVICE */
interface IServiceAdditionalProperties {
  accountName: string;
}

export type ServicePropertiesModel = Models.StorageServiceProperties &
  IServiceAdditionalProperties;

/** MODELS FOR CONTAINER */
interface IContainerAdditionalProperties {
  accountName: string;
}

export type ContainerModel = Models.ContainerItem &
  IContainerAdditionalProperties;

/** MODELS FOR BLOBS */
interface IPersistencyPropertiesRequired {
  /**
   * A unique ID refers to the persisted payload data for a blob or block.
   *
   * @type {string}
   * @memberof IPersistencyProperties
   */
  persistencyID: string;
}

interface IPersistencyPropertiesOptional {
  /**
   * A unique ID refers to the persisted payload data for a blob or block.
   *
   * @type {string}
   * @memberof IPersistencyProperties
   */
  persistencyID?: string;
}

interface IBlockBlobAdditionalProperties {
  /**
   * False for uncommitted block blob, otherwise true.
   *
   * @type {boolean}
   * @memberof IBlobAdditionalProperties
   */
  isCommitted: boolean;

  /**
   * Committed blocks for block blob.
   *
   * @type {PersistencyBlockModel[]}
   * @memberof IBlobAdditionalProperties
   */
  committedBlocksInOrder?: PersistencyBlockModel[];
}

interface IPersistencyPageRange {
  [offset: number]: IPersistencyPropertiesRequired & Models.PageRange;
}

interface IPageBlobAdditionalProperties {
  pageRanges?: IPersistencyPageRange;
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
 * TODO: Split payload and binary data store APIs to another interface.
 *
 * @export
 * @interface IBlobDataStore
 * @extends {IDataStore}
 */
export interface IBlobDataStore extends IDataStore {
  /**
   * Update blob service properties. Create service properties document if not exists in persistency layer.
   * Assume service properties collection has been created during start method.
   *
   * @template T
   * @param {T} serviceProperties
   * @returns {Promise<T>}
   * @memberof IBlobDataStore
   */
  updateServiceProperties<T extends ServicePropertiesModel>(
    serviceProperties: T
  ): Promise<T>;

  /**
   * Get service properties for specific storage account.
   *
   * @template T
   * @param {string} account
   * @returns {Promise<T | undefined>}
   * @memberof IBlobDataStore
   */
  getServiceProperties<T extends ServicePropertiesModel>(
    account: string
  ): Promise<T | undefined>;

  /**
   * Get a container item from persistency layer by account and container name.
   *
   * @template T
   * @param {string} account
   * @param {string} container
   * @returns {(Promise<T | undefined>)}
   * @memberof IBlobDataStore
   */
  getContainer<T extends ContainerModel>(
    account: string,
    container: string
  ): Promise<T | undefined>;

  /**
   * Delete container item if exists from persistency layer.
   * Note that this method will only remove container related document from persistency layer.
   * Make sure blobs under the container has been properly handled before calling this method.
   *
   * @param {string} account
   * @param {string} container
   * @returns {Promise<void>}
   * @memberof IBlobDataStore
   */
  deleteContainer(account: string, container: string): Promise<void>;

  /**
   * Update a container item in persistency layer. If the container doesn't exist, it will be created.
   *
   * @template T
   * @param {T} container
   * @returns {Promise<T>}
   * @memberof IBlobDataStore
   */
  updateContainer<T extends ContainerModel>(container: T): Promise<T>;

  /**
   * List containers with query conditions specified.
   *
   * @template T
   * @param {string} account
   * @param {string} [prefix]
   * @param {number} [maxResults]
   * @param {number} [marker]
   * @returns {(Promise<[T[], number | undefined]>)} A tuple including containers and next marker
   * @memberof IBlobDataStore
   */
  listContainers<T extends ContainerModel>(
    account: string,
    prefix?: string,
    maxResults?: number,
    marker?: number
  ): Promise<[T[], number | undefined]>;

  /**
   * Update blob item in persistency layer. Will create if blob doesn't exist.
   *
   * @template T
   * @param {T} blob
   * @returns {Promise<T>}
   * @memberof IBlobDataStore
   */
  updateBlob<T extends BlobModel>(blob: T): Promise<T>;

  /**
   * Gets a blob item from persistency layer by container name and blob name.
   *
   * @template T
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @returns {(Promise<T | undefined>)}
   * @memberof IBlobDataStore
   */
  getBlob<T extends BlobModel>(
    account: string,
    container: string,
    blob: string
  ): Promise<T | undefined>;

  /**
   * List blobs with query conditions specified.
   *
   * @template T
   * @param {string} account
   * @param {string} container
   * @param {string} [prefix]
   * @param {number} [maxResults]
   * @param {number} [marker]
   * @returns {(Promise<[T[], number | undefined]>)} A tuple including list blobs and next marker.
   * @memberof IBlobDataStore
   */
  listBlobs<T extends BlobModel>(
    account: string,
    container: string,
    prefix?: string,
    maxResults?: number,
    marker?: number
  ): Promise<[T[], number | undefined]>;

  /**
   * Delete blob item from persistency layer.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<void>}
   * @memberof IBlobDataStore
   */
  deleteBlob(account: string, container: string, blob: string): Promise<void>;

  /**
   * Update blob block item in persistency layer. Will create if block doesn't exist.
   *
   * @template T
   * @param {T} block
   * @returns {Promise<T>}
   * @memberof IBlobDataStore
   */
  updateBlock<T extends BlockModel>(block: T): Promise<T>;

  /**
   * Delete all blocks for a blob in persistency layer.
   *
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<void>}
   * @memberof IBlobDataStore
   */
  deleteBlocks(account: string, container: string, blob: string): Promise<void>;

  /**
   * Insert blocks for a blob in persistency layer. Existing blocks with same name will be replaced.
   *
   * @template T
   * @param {T[]} blocks
   * @returns {Promise<T[]>}
   * @memberof IBlobDataStore
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
   * @param {string} account
   * @param {string} container
   * @param {string} blob
   * @param {boolean} isCommitted
   * @returns {(Promise<T[]>)}
   * @memberof IBlobDataStore
   */
  listBlocks<T extends BlockModel>(
    account: string,
    container: string,
    blob: string,
    isCommitted: boolean
  ): Promise<T[]>;

  /**
   * Persist payload and return a unique persistency ID for tracking.
   *
   * @param {NodeJS.ReadableStream | Buffer} payload
   * @returns {Promise<string>} Returns the unique persistency ID
   * @memberof IBlobDataStore
   */
  writePayload(payload: NodeJS.ReadableStream | Buffer): Promise<string>;

  /**
   * Reads a persistency layer payload with a persistency ID.
   *
   * @param {string} [persistencyID] Persistency payload ID
   * @param {number} [offset] Optional. Payload reads offset. Default is 0.
   * @param {number} [count] Optional. Payload reads count. Default is Infinity.
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof IBlobDataStore
   */
  readPayload(
    persistencyID?: string,
    offset?: number,
    count?: number
  ): Promise<NodeJS.ReadableStream>;

  /**
   * Reads a persistency layer data cross multi persistency payloads by order.
   *
   * @param {string[]} persistencyIDs Persistency payload ID list
   * @param {number} [offset] Optional. Payload reads offset. Default is 0.
   * @param {number} [count] Optional. Payload reads count. Default is Infinity.
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof IBlobDataStore
   */
  readPayloads(
    persistencyIDs: string[],
    offset?: number,
    count?: number
  ): Promise<NodeJS.ReadableStream>;

  /**
   * Remove payloads from persistency layer.
   *
   * @param {string[]} persistencyIDs
   * @returns {Promise<void>}
   * @memberof IBlobDataStore
   */
  deletePayloads(persistencyIDs: string[]): Promise<void>;
}

export default IBlobDataStore;
