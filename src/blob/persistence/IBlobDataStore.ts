import { IDataStore } from "../../common/IDataStore";
import * as Models from "../generated/artifacts/models";

export interface IBlobPrivateProperties {
  isCommitted: boolean;
}

export type BlobModel = IBlobPrivateProperties & Models.BlobItem;

export interface IBlock {
  blobName: string;
  name: string;
  size: number;
  isCommitted: boolean;
  // isDeleted: boolean; // TODO: Do we need a mark to simulate async GC?
}

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
  setServiceProperties<T extends Models.StorageServiceProperties>(
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
  getServiceProperties<T extends Models.StorageServiceProperties>(): Promise<T>;

  /**
   * Get a container item from persistency layer by container name.
   *
   * @template T
   * @param {string} container
   * @returns {(Promise<T | undefined>)}
   * @memberof IBlobDataStore
   */
  getContainer<T extends Models.ContainerItem>(
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
  updateContainer<T extends Models.ContainerItem>(container: T): Promise<T>;

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
  listContainers<T extends Models.ContainerItem>(
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
   * Persist blob payload.
   *
   * @param {string} container
   * @param {string} blob
   * @param {NodeJS.ReadableStream} payload
   * @returns {Promise<void>}
   * @memberof IBlobDataStore
   */
  writeBlobPayload(
    container: string,
    blob: string,
    payload: NodeJS.ReadableStream
  ): Promise<void>;

  /**
   * Read blob payload.
   *
   * @param {string} container
   * @param {string} blob
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof IBlobDataStore
   */
  readBlobPayload(
    container: string,
    blob: string
  ): Promise<NodeJS.ReadableStream>;
}

export default IBlobDataStore;
