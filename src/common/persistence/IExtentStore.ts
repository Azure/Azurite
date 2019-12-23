import ICleaner from "../ICleaner";
import IDataStore from "../IDataStore";
import IExtentMetadataStore from "./IExtentMetadataStore";

/**
 * This model describes a chunk inside a persistency extent for a given extent ID.
 * A chunk points to a sub-range of an extent.
 *
 * @export
 * @interface IExtentChunk
 */
export interface IExtentChunk {
  id: string; // The persistency layer storage extent ID where the chunk belongs to.
  offset: number; // Chunk offset inside the extent where chunk starts in bytes.
  count: number; // Chunk length in bytes.
}

interface IStoreDestinationConfigure {
  locationPath: string;
  locationId: string;
  maxConcurrency: number;
}

export type StoreDestinationArray = IStoreDestinationConfigure[];

/**
 * Persistency layer data store interface interacting with the storage media.
 * It provides the methods to read and write data with the storage.
 *
 * @export
 * @interface IExtentStore
 * @extends {IDataStore}
 */
export default interface IExtentStore extends IDataStore, ICleaner {
  /**
   * Append data to extent layer.
   * Return the extent chunk information including the extentId, offset and count.
   *
   * @param {(NodeJS.ReadableStream | Buffer)} data
   * @param {string} [contextId]
   * @returns {Promise<IExtentChunk>}
   * @memberof IExtentStore
   */
  appendExtent(
    data: NodeJS.ReadableStream | Buffer,
    contextId?: string
  ): Promise<IExtentChunk>;

  /**
   * Read data from persistency layer according to the given IExtentChunk.
   *
   * @param {IExtentChunk} [extentChunk]
   * @param {string} [contextId]
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof IExtentStore
   */
  readExtent(
    extentChunk?: IExtentChunk,
    contextId?: string
  ): Promise<NodeJS.ReadableStream>;

  /**
   * Merge several extent chunks to a ReadableStream according to the offset and count.
   *
   * @param {(IExtentChunk)[]} extentChunkArray
   * @param {number} offset
   * @param {number} count
   * @param {string} [contextId]
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof IExtentStore
   */
  readExtents(
    extentChunkArray: (IExtentChunk)[],
    offset: number,
    count: number,
    contextId?: string
  ): Promise<NodeJS.ReadableStream>;

  /**
   * Delete the extents from persistency layer.
   *
   * @param {Iterable<string>} persistency
   * @returns {Promise<number>} Number of extents deleted
   * @memberof IExtentStore
   */
  deleteExtents(persistency: Iterable<string>): Promise<number>;

  /**
   * Return its metadata store.
   *
   * @returns {IExtentMetadata}
   * @memberof IExtentStore
   */
  getMetadataStore(): IExtentMetadataStore;
}
