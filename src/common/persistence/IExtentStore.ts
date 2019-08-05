import { IDataStore } from "../IDataStore";
import IExtentMetadata from "./IExtentMetadata";

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
  persistencyPath: string;
  persistencyId: string;
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
export default interface IExtentStore extends IDataStore {
  /**
   * Append data to extent layer.
   * Return the extent chunk information including the extentId, offset and count.
   *
   * @param {NodeJS.ReadableStream | Buffer} data
   * @returns {Promise<IExtentChunk>}
   * @memberof IExtentStore
   */
  appendExtent(data: NodeJS.ReadableStream | Buffer): Promise<IExtentChunk>;

  /**
   * Read data from persistency layer accoding to the given IExtentChunk.
   *
   * @param {IExtentChunk} persistency
   * @returns {Promise<NodeJS.ReadableStream>}
   * @memberof IExtentStore
   */
  readExtent(extentChunk: IExtentChunk): Promise<NodeJS.ReadableStream>;

  /**
   * Delete the extents from persistency layer.
   *
   * @param {Iterable<string>} persistency
   * @returns {Promise<void>}
   * @memberof IExtentStore
   */
  deleteExtents(persistency: Iterable<string>): Promise<void>;

  /**
   * Return its metadata store.
   *
   * @returns {IExtentMetadata}
   * @memberof IExtentStore
   */
  getMetadataStore(): IExtentMetadata;
}
