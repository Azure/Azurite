import { IDataStore } from "../../common/IDataStore";
import * as Models from "../generated/artifacts/models";

export type ServicePropertiesModel = Models.StorageServiceProperties;
export type ContainerModel = Models.ContainerItem;

export interface IPersistencyPropertiesRequired {
  /**
   * A unique ID refers to the persisted payload data for a blob or block.
   *
   * @type {string}
   * @memberof IPersistencyProperties
   */
  persistencyID: string;
}

export interface IPersistencyPropertiesOptional {
  /**
   * A unique ID refers to the persisted payload data for a blob or block.
   *
   * @type {string}
   * @memberof IPersistencyProperties
   */
  persistencyID?: string;
}

/** MODELS FOR BLOBS */
export interface IBlobAdditionalProperties {
  isCommitted: boolean;
  committedBlocksInOrder?: PersistencyBlockModel[];
}
export type BlobModel = IBlobAdditionalProperties &
  Models.BlobItem &
  IPersistencyPropertiesOptional;

/** MODELS FOR BLOCKS */
export interface IBlockAdditionalProperties {
  containerName: string;
  blobName: string;
  isCommitted: boolean;
}
export type PersistencyBlockModel = Models.Block &
  IPersistencyPropertiesRequired;
export type BlockModel = IBlockAdditionalProperties & PersistencyBlockModel;

/**
 * Persistency layer data store interface.
 *
 * @export
 * @interface IBlobDataStore
 * @extends {IDataStore}
 */
export interface IBlobDataStore extends IDataStore {
  /**
   * Update blob service properties. Create service properties document if not exists in persistency layer.
   * Assume service properties collection has been created.
   *
   * @template T
   * @param {T} serviceProperties
   * @returns {Promise<T>}
   * @memberof IBlobDataStore
   */
  setServiceProperties<T extends ServicePropertiesModel>(
    serviceProperties: T
  ): Promise<T>;

  /**
   * Get service properties.
   * Assume service properties collection has already be initialized with 1 document.
   *
   * @template T
   * @returns {Promise<T>}
   * @memberof IBlobDataStore
   */
  getServiceProperties<T extends ServicePropertiesModel>(): Promise<T>;

  /**
   * Get a container item from persistency layer by container name.
   *
   * @template T
   * @param {string} container
   * @returns {(Promise<T | undefined>)}
   * @memberof IBlobDataStore
   */
  getContainer<T extends ContainerModel>(
    container: string
  ): Promise<T | undefined>;

  /**
   * Delete container item if exists from persistency layer.
   * Note that this method will remove container related collections and documents from persistency layer.
   * Make sure blobs under the container has been properly removed before calling this method.
   *
   * @param {string} container
   * @returns {Promise<void>}
   * @memberof IBlobDataStore
   */
  deleteContainer(container: string): Promise<void>;

  /**
   * Update a container item in persistency layer. If the container doesn't exist, it will be created.
   * For a update operation, parameter container should be a valid loki persistency layer document object
   * retrieved by calling getContainer().
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
   * @param {string} [prefix]
   * @param {number} [maxResults]
   * @param {number} [marker]
   * @returns {(Promise<[T[], number | undefined]>)}
   * @memberof IBlobDataStore
   */
  listContainers<T extends ContainerModel>(
    prefix?: string,
    maxResults?: number,
    marker?: number
  ): Promise<[T[], number | undefined]>;

  /**
   * Update blob item in persistency layer. Will create if blob doesn't exist.
   * For a update operation, blob item should be a valid loki persistency layer document object
   * retrieved by calling getBlob().
   *
   * @template T
   * @param {string} container
   * @param {T} blob
   * @returns {Promise<T>}
   * @memberof IBlobDataStore
   */
  updateBlob<T extends BlobModel>(container: string, blob: T): Promise<T>;

  /**
   * Gets a blob item from persistency layer by container name and blob name.
   *
   * @template T
   * @param {string} container
   * @param {string} blob
   * @returns {(Promise<T | undefined>)}
   * @memberof IBlobDataStore
   */
  getBlob<T extends BlobModel>(
    container: string,
    blob: string
  ): Promise<T | undefined>;

  /**
   * Delete blob item from persistency layer.
   *
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<void>}
   * @memberof IBlobDataStore
   */
  deleteBlob(container: string, blob: string): Promise<void>;

  /**
   * Update blob block item in persistency layer. Will create if block doesn't exist.
   * For a update operation, block item should be a valid loki persistency layer document object
   * retrieved by calling getBlocks().
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
   * @template T
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<void>}
   * @memberof IBlobDataStore
   */
  deleteBlocks<T extends BlockModel>(
    container: string,
    blob: string
  ): Promise<void>;

  /**
   * Insert blocks for a blob in persistency layer. Order of blocks should be saved too when
   * getBlocks(). Existing blocks with same name will be replaced.
   *
   * @template T
   * @param {string} container
   * @param {string} blob
   * @param {T[]} blocks
   * @returns {Promise<T[]>}
   * @memberof IBlobDataStore
   */
  insertBlocks<T extends BlockModel>(blocks: T[]): Promise<T[]>;

  /**
   * Gets block for a blob from persistency layer by
   * container name, blob name and block name.
   *
   * @template T
   * @param {string} container
   * @param {string} blob
   * @param {string} block
   * @param {boolean} isCommitted
   * @returns {Promise<T | undefined>}
   * @memberof LokiBlobDataStore
   */
  getBlock<T extends BlockModel>(
    container: string,
    blob: string,
    block: string,
    isCommitted: boolean
  ): Promise<T | undefined>;

  /**
   * Gets blocks list for a blob from persistency layer by container name and blob name.
   *
   * @template T
   * @param {string} container
   * @param {string} blob
   * @param {boolean} isCommitted
   * @returns {(Promise<T[]>)}
   * @memberof IBlobDataStore
   */
  getBlocks<T extends BlockModel>(
    container: string,
    blob: string,
    isCommitted: boolean
  ): Promise<T[]>;

  /**
   * Persist payload and return a unique persistency ID for tracking.
   *
   * @param {NodeJS.ReadableStream} payload
   * @returns {Promise<string>}
   * @memberof IBlobDataStore
   */
  writePayload(payload: NodeJS.ReadableStream): Promise<string>;

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
